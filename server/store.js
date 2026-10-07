'use strict';
const crypto = require('crypto');
const { STATUSES, HttpError, LINK_TYPES } = require('./validate');
const { seed, seedDesigners } = require('./seed');
const { ConflictError } = require('./persist');

const newToken = () => crypto.randomBytes(18).toString('base64url');

class Store {
  /** `persistence` is a FilePersistence or BlobPersistence (see persist.js). A fresh store starts empty. */
  constructor(persistence, { seedDemo = false } = {}) {
    this.p = persistence;
    this.seedDemo = seedDemo; // sample projects/designers only when explicitly enabled (SEED_DEMO_DATA=true)
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
    if (r) { this.data = JSON.parse(r.text); this.version = r.version; this.dirty = false; } else { this.data = this.seedDemo ? seed() : { projects: [], tasks: [], designers: [], links: [], clients: [], requests: [], timesheet: {} }; this.version = null; this.dirty = true; }
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
    if (!this.data.designers) { this.data.designers = this.seedDemo ? seedDesigners() : []; changed = true; }
    for (const d of this.data.designers) {
      if (d.email === undefined) { d.email = ''; changed = true; }
      if (d.passwordHash === undefined) { d.passwordHash = ''; changed = true; }
      if (d.tokenVersion === undefined) { d.tokenVersion = 0; changed = true; }
      if (!Array.isArray(d.projectIds)) { d.projectIds = []; changed = true; }
      if (d.notify === undefined) { d.notify = true; d.resetHash = ''; d.resetExpires = 0; changed = true; }
    }
    if (!this.data.links) { this.data.links = []; changed = true; }
    if (!this.data.clients) { this.data.clients = []; changed = true; }
    if (!this.data.requests) { this.data.requests = []; changed = true; }
    if (!this.data.timesheet) { this.data.timesheet = {}; changed = true; }
    for (const c of this.data.clients) if (c.notify === undefined) { c.notify = true; c.resetHash = ''; c.resetExpires = 0; changed = true; }
    for (const p of this.data.projects) if (p.status === 'planning') { p.status = 'active'; changed = true; } // the Planning status was removed
    for (const t of this.data.tasks) for (const a of t.attachments || []) {
      if (a.uploadedById === 'owner' && a.uploadedByName === 'Freelancer') { a.uploadedByName = 'Admin'; changed = true; }
      if (!a.visibility) { a.visibility = 'internal'; changed = true; } // files were team-only until sharing existed
    }
    for (const t of this.data.tasks) for (const c of t.comments || []) {
      if (c.authorId === 'owner' && c.authorName === 'Freelancer') { c.authorName = 'Admin'; changed = true; } // the account is called Admin now
      if (!c.visibility) { c.visibility = 'internal'; changed = true; } // older comments were team-only
      if (!c.authorRole) { c.authorRole = c.authorId === 'owner' ? 'owner' : 'designer'; changed = true; }
    }
    for (const t of this.data.tasks) {
      if (!Array.isArray(t.comments)) { t.comments = []; changed = true; }
      if (!Array.isArray(t.attachments)) { t.attachments = []; changed = true; }
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
    return full ? { ...base, email: d.email, hasLogin: !!(d.email && d.passwordHash), projectIds: d.projectIds || [] } : base;
  }

  listDesigners(opts) { return this.data.designers.map((d) => this.publicDesigner(d, opts)); }

  /** Emails are unique across designers and clients so a sign-in always finds exactly one account. */
  assertEmailFree(email, exceptId) {
    if (email && [...this.data.designers, ...this.data.clients].some((a) => a.email === email && a.id !== exceptId)) {
      throw new HttpError(409, 'Another account already uses that email');
    }
  }

  // ---- clients (accounts that can view the projects they are assigned) ----
  getClient(id) { return this.data.clients.find((c) => c.id === id); }

  findClientByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return e ? this.data.clients.find((c) => c.email === e) : undefined;
  }

  publicClient(c) {
    return { id: c.id, name: c.name, company: c.company, email: c.email, hasLogin: !!(c.email && c.passwordHash), projectIds: c.projectIds };
  }

  listClients() { return this.data.clients.map((c) => this.publicClient(c)); }

  validProjectIds(ids = []) {
    const known = new Set(this.data.projects.map((p) => p.id));
    if (ids.some((id) => !known.has(id))) throw new HttpError(400, 'Unknown project');
    return ids;
  }

  createClient({ name, company = '', email, passwordHash, projectIds = [] }) {
    if (!email || !passwordHash) throw new HttpError(400, 'A client needs an email and a password');
    this.assertEmailFree(email);
    const c = { id: crypto.randomUUID(), name, company, email, passwordHash, tokenVersion: 0, projectIds: this.validProjectIds(projectIds), createdAt: new Date().toISOString() };
    this.data.clients.push(c);
    this.save();
    return this.publicClient(c);
  }

  /** Changing the email or password bumps tokenVersion, which signs the client out everywhere. */
  updateClient(id, { name, company, email, passwordHash, projectIds }) {
    const c = this.getClient(id);
    if (!c) throw new HttpError(404, 'Client not found');
    const nextEmail = email !== undefined ? email : c.email;
    const nextHash = passwordHash !== undefined ? passwordHash : c.passwordHash;
    if (nextEmail && !nextHash) throw new HttpError(400, 'Set a password for this login');
    if (nextHash && !nextEmail) throw new HttpError(400, 'Add an email for this login');
    this.assertEmailFree(nextEmail, id);
    if (projectIds !== undefined) c.projectIds = this.validProjectIds(projectIds);
    if (name !== undefined) c.name = name;
    if (company !== undefined) c.company = company;
    if (nextEmail !== c.email || nextHash !== c.passwordHash) c.tokenVersion += 1;
    c.email = nextEmail; c.passwordHash = nextHash;
    this.save();
    return this.publicClient(c);
  }

  deleteClient(id) {
    if (!this.getClient(id)) throw new HttpError(404, 'Client not found');
    this.data.clients = this.data.clients.filter((c) => c.id !== id); // their sessions stop validating immediately
    this.save();
  }

  /** Active projects a client account is assigned to. */
  projectsForClient(clientId) {
    const c = this.getClient(clientId);
    if (!c) return [];
    return this.data.projects.filter((p) => !p.archived && c.projectIds.includes(p.id));
  }

  // ---- project requests (client onboarding): clients submit, the admin accepts into a real project or declines ----
  listRequests(clientId) {
    const all = this.data.requests.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clientId ? all.filter((r) => r.clientId === clientId) : all;
  }

  createRequest(client, fields, est) {
    const r = {
      id: crypto.randomUUID(), clientId: client.id, clientName: client.name, company: client.company || '', ...fields,
      days: est.days, estimate: est, status: 'new', projectId: '', createdAt: new Date().toISOString(),
    };
    this.data.requests.push(r);
    this.save();
    return r;
  }

  /** Turns a request into an active project assigned to the client, with one backlog task per goal. */
  acceptRequest(id) {
    const r = this.data.requests.find((x) => x.id === id);
    if (!r) throw new HttpError(404, 'Request not found');
    if (r.status !== 'new') throw new HttpError(409, 'This request was already handled');
    const project = this.createProject({ name: r.name, client: r.company || r.clientName, status: 'active', summary: r.description, dueDate: r.dueDate });
    r.goals.forEach((g, i) => this.createTask(project.id, { title: g, status: 'backlog', priority: 'high', description: i === 0 ? `Important goal from the project brief (${r.type}).` : 'Important goal from the project brief.' }));
    const c = this.getClient(r.clientId);
    if (c && !c.projectIds.includes(project.id)) c.projectIds.push(project.id);
    r.status = 'accepted'; r.projectId = project.id;
    this.save();
    return r;
  }

  declineRequest(id) {
    const r = this.data.requests.find((x) => x.id === id);
    if (!r) throw new HttpError(404, 'Request not found');
    if (r.status !== 'new') throw new HttpError(409, 'This request was already handled');
    r.status = 'declined';
    this.save();
    return r;
  }

  deleteRequest(id) {
    if (!this.data.requests.some((x) => x.id === id)) throw new HttpError(404, 'Request not found');
    this.data.requests = this.data.requests.filter((x) => x.id !== id);
    this.save();
  }

  // ---- timesheet (the /emerald page): hours and notes per day, keyed by date ----
  timesheetMonth(month) {
    return Object.fromEntries(Object.entries(this.data.timesheet).filter(([d]) => d.startsWith(`${month}-`)).sort(([a], [b]) => a.localeCompare(b)));
  }

  setTimesheetEntry(date, { hours, note, off }) {
    if (hours === 0 && note === '' && off === null) delete this.data.timesheet[date];
    else this.data.timesheet[date] = { hours, note, ...(off === null ? {} : { off }), updatedAt: new Date().toISOString() };
    this.save();
    return this.data.timesheet[date] || { hours: 0, note: '' };
  }

  // ---- email: password links, notification preference, due-date reminders ----
  findAccountByEmail(email) {
    const d = this.findDesignerByEmail(email);
    if (d) return { kind: 'designer', acct: d };
    const c = this.findClientByEmail(email);
    return c ? { kind: 'client', acct: c } : null;
  }

  accountOf(kind, id) { return kind === 'designer' ? this.getDesigner(id) : this.getClient(id); }

  /** A one-time link to choose a password. Only a hash of the token is stored. */
  createResetToken(kind, id, ttlMs) {
    const acct = this.accountOf(kind, id);
    if (!acct) throw new HttpError(404, 'Account not found');
    const token = crypto.randomBytes(32).toString('base64url');
    acct.resetHash = crypto.createHash('sha256').update(token).digest('base64url');
    acct.resetExpires = Date.now() + ttlMs;
    this.save();
    return token;
  }

  /** Sets the new password if the token is valid and unused, signs the account out everywhere, and burns the token. */
  consumeReset(token, passwordHash) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('base64url');
    const all = [...this.data.designers.map((acct) => ({ kind: 'designer', acct })), ...this.data.clients.map((acct) => ({ kind: 'client', acct }))];
    const hit = all.find(({ acct }) => acct.resetHash && acct.resetHash === hash && acct.resetExpires > Date.now() && acct.email);
    if (!hit) return null;
    hit.acct.passwordHash = passwordHash;
    hit.acct.tokenVersion += 1;
    hit.acct.resetHash = ''; hit.acct.resetExpires = 0;
    this.save();
    return hit;
  }

  setNotify(kind, id, on) {
    const acct = this.accountOf(kind, id);
    if (!acct) throw new HttpError(404, 'Account not found');
    acct.notify = !!on;
    this.save();
  }

  /**
   * Open tasks due `today` that haven't been reminded yet, grouped per person: the assigned designer, and each client who has
   * the project. Marks them so a task is only ever reminded once for a given due date.
   */
  takeDueReminders(today) {
    const due = this.data.tasks.filter((t) => t.status !== 'done' && t.dueDate === today && t.reminderSent !== today);
    const groups = new Map();
    const add = (kind, acct, task, project) => {
      const key = `${kind}:${acct.id}`;
      if (!groups.has(key)) groups.set(key, { kind, acct, tasks: [] });
      groups.get(key).tasks.push({ id: task.id, title: task.title, projectId: project.id, project: project.name });
    };
    for (const t of due) {
      const project = this.data.projects.find((p) => p.id === t.projectId);
      t.reminderSent = today;
      if (!project || project.archived) continue;
      const d = this.getDesigner(t.assigneeId);
      if (d && d.email && d.passwordHash && d.notify !== false) add('designer', d, t, project);
      for (const c of this.data.clients) if (c.email && c.passwordHash && c.notify !== false && c.projectIds.includes(project.id)) add('client', c, t, project);
    }
    if (due.length) this.save();
    return [...groups.values()];
  }

  createDesigner({ name, role = '', email = '', passwordHash = '', projectIds = [] }) {
    if (email && !passwordHash) throw new HttpError(400, 'Set a password for this login');
    if (passwordHash && !email) throw new HttpError(400, 'Add an email for this login');
    this.assertEmailFree(email);
    const d = { id: crypto.randomUUID(), name, role, email, passwordHash, tokenVersion: 0, projectIds: this.validProjectIds(projectIds) };
    this.data.designers.push(d);
    this.save();
    return this.publicDesigner(d, { full: true });
  }

  /** Changing the email or password bumps tokenVersion, which signs the designer out everywhere. */
  updateDesigner(id, { name, role, email, passwordHash, projectIds }) {
    if (projectIds !== undefined) this.validProjectIds(projectIds);
    const d = this.getDesigner(id);
    if (!d) throw new HttpError(404, 'Designer not found');
    const nextEmail = email !== undefined ? email : d.email;
    const nextHash = passwordHash !== undefined ? passwordHash : d.passwordHash;
    if (nextEmail && !nextHash) throw new HttpError(400, 'Set a password for this login');
    if (nextHash && !nextEmail) throw new HttpError(400, 'Add an email for this login');
    this.assertEmailFree(nextEmail, id);
    if (name !== undefined) d.name = name;
    if (role !== undefined) d.role = role;
    if (projectIds !== undefined) d.projectIds = projectIds;
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

  /** Projects (non-archived) the designer is assigned to, directly or through at least one task. */
  projectIdsFor(designerId) {
    const ids = new Set(this.data.tasks.filter((t) => t.assigneeId === designerId).map((t) => t.projectId));
    for (const pid of (this.getDesigner(designerId) || {}).projectIds || []) ids.add(pid); // projects the admin assigned directly
    return new Set([...ids].filter((pid) => this.data.projects.some((p) => p.id === pid && !p.archived)));
  }

  // ---- task links (Jira-style "linked work items"): one stored edge, shown on both tasks with the inverse wording ----
  linksFor(taskId) {
    const out = [];
    for (const l of this.data.links) {
      const outgoing = l.fromId === taskId;
      if (!outgoing && l.toId !== taskId) continue;
      const other = this.data.tasks.find((t) => t.id === (outgoing ? l.toId : l.fromId));
      if (!other) continue;
      const project = this.data.projects.find((p) => p.id === other.projectId);
      out.push({
        id: l.id, type: l.type, label: LINK_TYPES[l.type][outgoing ? 'out' : 'in'],
        task: { id: other.id, title: other.title, status: other.status, projectId: other.projectId, projectName: project ? project.name : '' },
      });
    }
    return out;
  }

  addLink(taskId, { targetId, type, inverse = false }) {
    this.getTask(taskId);
    if (targetId === taskId) throw new HttpError(400, 'A task can’t be linked to itself');
    if (!this.data.tasks.some((t) => t.id === targetId)) throw new HttpError(404, 'The task to link to was not found');
    if (this.data.links.some((l) => (l.fromId === taskId && l.toId === targetId) || (l.fromId === targetId && l.toId === taskId))) {
      throw new HttpError(409, 'These tasks are already linked');
    }
    if (this.data.links.filter((l) => l.fromId === taskId || l.toId === taskId).length >= 50) throw new HttpError(400, 'Too many links on this task');
    const [fromId, toId] = inverse ? [targetId, taskId] : [taskId, targetId];
    this.data.links.push({ id: crypto.randomUUID(), fromId, toId, type, createdAt: new Date().toISOString() });
    this.save();
  }

  deleteLink(taskId, linkId) {
    const l = this.data.links.find((x) => x.id === linkId && (x.fromId === taskId || x.toId === taskId));
    if (!l) throw new HttpError(404, 'Link not found');
    this.data.links = this.data.links.filter((x) => x.id !== linkId);
    this.save();
  }

  /** Tasks in active projects matching the text (title or project name); used by the "link a task" picker. */
  searchTasks(q, excludeId) {
    const needle = String(q || '').trim().toLowerCase();
    return this.data.tasks
      .map((t) => ({ t, p: this.data.projects.find((p) => p.id === t.projectId) }))
      .filter(({ t, p }) => p && !p.archived && t.id !== excludeId && (!needle || t.title.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)))
      .slice(0, 15)
      .map(({ t, p }) => ({ id: t.id, title: t.title, status: t.status, projectId: p.id, projectName: p.name }));
  }

  // ---- attachments (metadata here; the bytes live in a files driver) ----
  addPendingAttachment(taskId, { name, size, type, uploadedById, uploadedByName, visibility = 'internal' }) {
    const task = this.getTask(taskId);
    if (task.attachments.length >= 20) throw new HttpError(400, 'A task can have at most 20 attachments');
    const id = crypto.randomUUID();
    const att = { id, name, size, type, uploadedById, uploadedByName, uploadedAt: new Date().toISOString(), status: 'pending', visibility, pathname: `client-kanban/attachments/${id}/${name}` };
    task.attachments.push(att);
    this.save();
    return { task, att };
  }

  findAttachment(attId) {
    for (const task of this.data.tasks) {
      const att = task.attachments.find((a) => a.id === attId);
      if (att) return { task, att };
    }
    return null;
  }

  completeAttachment(attId, size) {
    const found = this.findAttachment(attId);
    found.att.status = 'ready'; found.att.size = size; found.att.uploadedAt = new Date().toISOString();
    this.save();
    return found.task;
  }

  setAttachmentVisibility(taskId, attId, visibility) {
    const task = this.getTask(taskId);
    const att = task.attachments.find((a) => a.id === attId);
    if (!att) throw new HttpError(404, 'Attachment not found');
    att.visibility = visibility;
    this.save();
    return task;
  }

  removeAttachment(taskId, attId) {
    const task = this.getTask(taskId);
    const att = task.attachments.find((a) => a.id === attId);
    if (!att) throw new HttpError(404, 'Attachment not found');
    task.attachments = task.attachments.filter((a) => a.id !== attId);
    this.save();
    return { task, att };
  }

  /** Uploads that were started but never finished (closed tab, lost connection). They are dropped after an hour. */
  purgeStaleAttachments() {
    const cutoff = Date.now() - 3600e3;
    const gone = [];
    for (const t of this.data.tasks) {
      const stale = t.attachments.filter((a) => a.status === 'pending' && Date.parse(a.uploadedAt) < cutoff);
      if (stale.length) { gone.push(...stale); t.attachments = t.attachments.filter((a) => !stale.includes(a)); }
    }
    if (gone.length) this.save();
    return gone;
  }

  attachmentsOfTasks(taskIds) {
    const ids = new Set(taskIds);
    return this.data.tasks.filter((t) => ids.has(t.id)).flatMap((t) => t.attachments);
  }

  // ---- comments (internal: never exposed through the client view) ----
  /** visibility: 'internal' (admin and designers) or 'client' (also visible to the client accounts of that project). */
  addComment(taskId, { text, authorId, authorRole = 'designer', visibility = 'internal' }) {
    const task = this.getTask(taskId);
    let authorName = 'Admin';
    if (authorRole === 'designer') {
      const d = this.data.designers.find((x) => x.id === authorId);
      if (!d) throw new HttpError(400, 'Unknown author');
      authorName = d.name;
    } else if (authorRole === 'client') {
      const c = this.getClient(authorId);
      if (!c) throw new HttpError(400, 'Unknown author');
      authorName = c.name;
    }
    task.comments.push({ id: crypto.randomUUID(), authorId, authorRole, authorName, visibility, text, createdAt: new Date().toISOString() });
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
    const gone = new Set(this.data.tasks.filter((t) => t.projectId === id).map((t) => t.id));
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.projectId !== id);
    this.data.links = this.data.links.filter((l) => !gone.has(l.fromId) && !gone.has(l.toId));
    this.data.clients.forEach((c) => { c.projectIds = c.projectIds.filter((pid) => pid !== id); });
    this.data.designers.forEach((d) => { d.projectIds = (d.projectIds || []).filter((pid) => pid !== id); });
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
      priority: 'medium', attachments: [], createdAt: now, updatedAt: now, ...rest,
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
    this.data.links = this.data.links.filter((l) => l.fromId !== id && l.toId !== id);
    this.save();
  }
}

module.exports = { Store };
