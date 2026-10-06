'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STATUSES, HttpError } = require('./validate');
const { seed, seedDesigners } = require('./seed');

const newToken = () => crypto.randomBytes(18).toString('base64url');

class Store {
  constructor(file) {
    this.file = file;
    if (fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
      this.data = seed();
      this.save();
    }
    this.migrate();
  }

  // Older data files predate designers, assignees and comments.
  migrate() {
    let changed = false;
    if (!this.data.designers) { this.data.designers = seedDesigners(); changed = true; }
    for (const t of this.data.tasks) {
      if (!Array.isArray(t.comments)) { t.comments = []; changed = true; }
      if (t.assigneeId === undefined) { t.assigneeId = ''; changed = true; }
    }
    if (changed) this.save();
  }

  checkAssignee(id) {
    if (id && !this.data.designers.some((d) => d.id === id)) throw new HttpError(400, 'Unknown designer');
  }

  // ---- designers ----
  listDesigners() { return this.data.designers; }

  createDesigner(fields) {
    const d = { id: crypto.randomUUID(), ...fields };
    this.data.designers.push(d);
    this.save();
    return d;
  }

  deleteDesigner(id) {
    if (!this.data.designers.some((d) => d.id === id)) throw new HttpError(404, 'Designer not found');
    this.data.designers = this.data.designers.filter((d) => d.id !== id);
    this.data.tasks.forEach((t) => { if (t.assigneeId === id) t.assigneeId = ''; }); // past comments keep the author's name
    this.save();
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

  // Atomic write so a crash can't leave a half-written file.
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
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
    const p = { id: crypto.randomUUID(), shareToken: newToken(), archived: false, createdAt: now, updatedAt: now, status: 'active', summary: '', dueDate: '', ...fields };
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
