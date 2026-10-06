'use strict';
const crypto = require('crypto');
const { STATUSES, HttpError } = require('./validate');
const { seed, seedDesigners } = require('./seed');
const { ConflictError } = require('./persist');

const newToken = () => crypto.randomBytes(18).toString('base64url');

class Store {
  /** `persistence` is a FilePersistence or BlobPersistence (see persist.js). */
  constructor(persistence) {
    this.p = persistence;
    this.data = null;
    this.version = null; // ETag of what we last read/wrote (shared stores only)
    this.dirty = false;
    this.chain = Promise.resolve();
  }

  /**
   * Single-process stores load once. Shared stores (Blob, several serverless instances) re-read the latest
   * copy at the start of every request, so no instance works from stale data.
   */
  async load() {
    if (!this.p.shared && this.data) return;
    const r = await this.p.load();
    if (r) { this.data = JSON.parse(r.text); this.version = r.version; this.dirty = false; } else { this.data = seed(); this.version = null; this.dirty = true; }
    this.migrate();
  }

  /** Persist pending changes. File storage writes straight away; shared storage writes once per request in flush(). */
  save() {
    this.dirty = true;
    if (!this.p.shared) { this.p.save(JSON.stringify(this.data, null, 2)); this.dirty = false; }
  }

  async flush() {
    if (!this.dirty) return;
    this.version = await this.p.save(JSON.stringify(this.data, null, 2), this.version);
    this.dirty = false;
  }

  /**
   * Run `fn` against fresh data, then commit. Requests in one instance run one at a time; across instances a
   * conflicting write is detected by the ETag and the whole step is retried on newer data.
   */
  transact(fn) {
    const run = async () => {
      for (let attempt = 0; ; attempt += 1) {
        await this.load();
        try {
          const result = await fn();
          await this.flush();
          return result;
        } catch (e) {
          if (this.p.shared) { this.data = null; this.dirty = false; } // never keep half-applied changes
          if (e instanceof ConflictError && attempt < 5) { await new Promise((r) => setTimeout(r, 30 * (attempt + 1) + Math.random() * 40)); continue; }
          throw e;
        }
      }
    };
    const next = this.chain.then(run);
    this.chain = next.catch(() => {});
    return next;
  }

  // Older data files predate designers, logins, assignees and comments.
  migrate() {
    let changed = false;
    if (!this.data.designers) { this.data.designers = seedDesigners(); changed = true; }
    for (const d of this.data.designers) {
      if (d.email === undefined) { d.email = ''; changed = true; }
      if (d.passwordHash === undefined) { d.passwordHash = ''; changed = true; }
      if (d.tokenVersion === undefined) { d.tokenVersion = 0; changed = true; }
    }
    for (const t of this.data.tasks) {
      if (!Array.isArray(t.comments)) { t.comments = []; changed = true; }
      if (t.assigneeId === undefined) { t.assigneeId = ''; changed = true; }
    }
    if (changed) this.dirty = true;
  }

  checkAssignee(id) {
    if (id && !this.data.designers.some((d) => d.id === id)) throw new HttpError(400, 'Unknown designer');
  }

  // ---- designers (accounts) ----
  getDesigner(id) { return this.data.designers.find((d) => d.id === id); }

  findDesignerByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return e ? this.data.designers.find((d) => d.email === e) : undefined;
  }

  /** Never includes the password hash. */
  publicDesigner(d, { full = false } = {}) {
    const base = { id: d.id, name: d.name, role: d.role };
    return full ? { ...base, email: d.email, hasLogin: !!(d.email && d.passwordHash) } : base;
  }

  listDesigners(opts) { return this.data.designers.map((d) => this.publicDesigner(d, opts)); }

  assertEmailFree(email, exceptId) {
    if (email && this.data.designers.some((d) => d.email === email && d.id !== exceptId)) throw new HttpError(409, 'Another designer already uses that email');
  }

  createDesigner({ name, role = '', email = '', passwordHash = '' }) {
    if (email && !passwordHash) throw new HttpError(400, 'Set a password for this login');
    if (passwordHash && !email) throw new HttpError(400, 'Add an email for this login');
    this.assertEmailFree(email);
    const d = { id: crypto.randomUUID(), name, role, email, passwordHash, tokenVersion: 0 };
    this.data.designers.push(d);
    this.save();
    return this.publicDesigner(d, { full: true });
  }

  /** Changing the email or password bumps tokenVersion, which signs the designer out everywhere. */
  updateDesigner(id, { name, role, email, passwordHash }) {
    const d = this.getDesigner(id);
    if (!d) throw new HttpError(404, 'Designer not found');
    const nextEmail = email !== undefined ? email : d.email;
    const nextHash = passwordHash !== undefined ? passwordHash : d.passwordHash;
    if (nextEmail && !nextHash) throw new HttpError(400, 'Set a password for this login');
    if (nextHash && !nextEmail) throw new HttpError(400, 'Add an email for this login');
    this.assertEmailFree(nextEmail, id);
    if (name !== undefined) d.name = name;
    if (role !== undefined) d.role = role;
    if (nextEmail !== d.email || nextHash !== d.passwordHash) d.tokenVersion += 1;
    d.email = nextEmail; d.passwordHash = nextHash;
    this.save();
    return this.publicDesigner(d, { full: true });
  }

  deleteDesigner(id) {
    if (!this.getDesigner(id)) throw new HttpError(404, 'Designer not found');
    this.data.designers = this.data.designers.filter((d) => d.id !== id); // their sessions stop validating immediately
    this.data.tasks.forEach((t) => { if (t.assigneeId === id) t.assigneeId = ''; }); // past comments keep the author's name
    this.save();
  }

  /** Projects (non-archived) in which the designer has at least one assigned task. */
  projectIdsFor(designerId) {
    const ids = new Set(this.data.tasks.filter((t) => t.assigneeId === designerId).map((t) => t.projectId));
    return new Set([...ids].filter((pid) => this.data.projects.some((p) => p.id === pid && !p.archived)));
  }

  // ---- comments (internal: never exposed through the client view) ----
  addComment(taskId, { text, authorId }) {
    const task = this.getTask(taskId);
    let authorName = 'Freelancer';
    if (authorId !== 'owner') {
      const d = this.data.designers.find((x) => x.id === authorId);
      if (!d) throw new HttpError(400, 'Unknown author');
      authorName = d.name;
    }
    task.comments.push({ id: crypto.randomUUID(), authorId, authorName, text, createdAt: new Date().toISOString() });
    this.save();
    return task;
  }

  deleteComment(taskId, commentId) {
    const task = this.getTask(taskId);
    if (!task.comments.some((c) => c.id === commentId)) throw new HttpError(404, 'Comment not found');
    task.comments = task.comments.filter((c) => c.id !== commentId);
    this.save();
    return task;
  }

  withStats(p) {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const tasks = this.data.tasks.filter((t) => t.projectId === p.id);
    tasks.forEach((t) => { counts[t.status] += 1; });
    const total = tasks.length;
    return { ...p, counts, total, progress: total ? Math.round((counts.done / total) * 100) : 0 };
  }

  listProjects() { return this.data.projects.map((p) => this.withStats(p)); }

  getProject(id) {
    const p = this.data.projects.find((x) => x.id === id);
    if (!p) throw new HttpError(404, 'Project not found');
    return p;
  }

  getProjectByToken(token) {
    const p = this.data.projects.find((x) => x.shareToken === token && !x.archived);
    if (!p) throw new HttpError(404, 'Project not found');
    return p;
  }

  tasksFor(projectId) { return this.data.tasks.filter((t) => t.projectId === projectId); }

  createProject(fields) {
    const now = new Date().toISOString();
    const p = { id: crypto.randomUUID(), shareToken: newToken(), archived: false, createdAt: now, updatedAt: now, status: 'active', summary: '', dueDate: '', recurring: false, ...fields };
    this.data.projects.push(p);
    this.save();
    return this.withStats(p);
  }

  updateProject(id, fields, { resetToken = false } = {}) {
    const p = this.getProject(id);
    Object.assign(p, fields, { updatedAt: new Date().toISOString() });
    if (resetToken) p.shareToken = newToken();
    this.save();
    return this.withStats(p);
  }

  deleteProject(id) {
    this.getProject(id);
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.projectId !== id);
    this.save();
  }

  getTask(id) {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t) throw new HttpError(404, 'Task not found');
    return t;
  }

  // Tasks live in one ordered array; a column's order is the array order filtered by status.
  place(task, status, position) {
    const all = this.data.tasks;
    const idx = all.indexOf(task);
    if (idx >= 0) all.splice(idx, 1);
    task.status = status;
    const column = all.filter((t) => t.projectId === task.projectId && t.status === status);
    if (position === undefined || position >= column.length) {
      const last = column[column.length - 1];
      all.splice(last ? all.indexOf(last) + 1 : all.length, 0, task);
    } else {
      all.splice(all.indexOf(column[position]), 0, task);
    }
  }

  createTask(projectId, fields) {
    this.getProject(projectId);
    this.checkAssignee(fields.assigneeId);
    const now = new Date().toISOString();
    const { position, ...rest } = fields;
    const task = {
      id: crypto.randomUUID(), projectId, description: '', clientUpdate: '', clientUpdateAt: '', privateNotes: '', dueDate: '', assigneeId: '', comments: [],
      priority: 'medium', createdAt: now, updatedAt: now, ...rest,
    };
    if (task.clientUpdate) task.clientUpdateAt = now;
    this.place(task, task.status || 'backlog', position);
    this.save();
    return task;
  }

  updateTask(id, fields) {
    const task = this.getTask(id);
    this.checkAssignee(fields.assigneeId);
    const now = new Date().toISOString();
    const { position, status, ...rest } = fields;
    if ('clientUpdate' in rest && rest.clientUpdate !== task.clientUpdate) {
      rest.clientUpdateAt = rest.clientUpdate ? now : '';
    }
    Object.assign(task, rest, { updatedAt: now });
    if (status !== undefined && (status !== task.status || position !== undefined)) {
      this.place(task, status, position);
    } else if (position !== undefined) {
      this.place(task, task.status, position);
    }
    this.save();
    return task;
  }

  deleteTask(id) {
    this.getTask(id);
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    this.save();
  }
}

module.exports = { Store };
