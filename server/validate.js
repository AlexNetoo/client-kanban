'use strict';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' },
  { id: 'done', label: 'Done' },
];
const STATUSES = COLUMNS.map((c) => c.id);
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'];
const PRIORITIES = ['low', 'medium', 'high'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function str(body, key, { max, required = false } = {}) {
  let v = body[key];
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${key} must be text`);
  v = v.trim();
  if (required && !v) throw new HttpError(400, `${key} is required`);
  if (v.length > max) throw new HttpError(400, `${key} must be ${max} characters or fewer`);
  return v;
}

function date(body, key) {
  const v = body[key];
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, `${key} must be a date (YYYY-MM-DD)`);
  }
  return v;
}

function oneOf(body, key, allowed) {
  if (!allowed.includes(body[key])) throw new HttpError(400, `${key} must be one of: ${allowed.join(', ')}`);
  return body[key];
}

// partial=true (PATCH): only validate fields that are present.
function cleanProject(body, partial = false) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const has = (k) => !partial || k in body;
  const out = {};
  if (has('name')) out.name = str(body, 'name', { max: 120, required: true });
  if (has('client')) out.client = str(body, 'client', { max: 120, required: true });
  if (has('summary')) out.summary = str(body, 'summary', { max: 1000 });
  if (has('dueDate')) out.dueDate = date(body, 'dueDate');
  if (has('status')) out.status = partial || body.status ? oneOf(body, 'status', PROJECT_STATUSES) : 'active';
  if ('archived' in body) out.archived = body.archived === true;
  if ('recurring' in body) out.recurring = body.recurring === true;
  if (out.recurring) out.dueDate = ''; // a recurring project has no end date
  return out;
}

function cleanTask(body, partial = false) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const has = (k) => !partial || k in body;
  const out = {};
  if (has('title')) out.title = str(body, 'title', { max: 160, required: true });
  if (has('description')) out.description = str(body, 'description', { max: 2000 });
  if (has('clientUpdate')) out.clientUpdate = str(body, 'clientUpdate', { max: 1000 });
  if (has('privateNotes')) out.privateNotes = str(body, 'privateNotes', { max: 2000 });
  if (has('dueDate')) out.dueDate = date(body, 'dueDate');
  if (has('status')) out.status = body.status === undefined ? 'backlog' : oneOf(body, 'status', STATUSES);
  if (has('priority')) out.priority = body.priority === undefined ? 'medium' : oneOf(body, 'priority', PRIORITIES);
  if (has('assigneeId')) out.assigneeId = str(body, 'assigneeId', { max: 64 });
  if ('position' in body) {
    if (!Number.isInteger(body.position) || body.position < 0) throw new HttpError(400, 'position must be a non-negative integer');
    out.position = body.position;
  }
  return out;
}

function cleanComment(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  return { text: str(body, 'text', { max: 1000, required: true }), authorId: str(body, 'authorId', { max: 64 }) || 'owner' };
}

function cleanDesigner(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  return { name: str(body, 'name', { max: 80, required: true }), role: str(body, 'role', { max: 80 }) };
}

module.exports = { cleanComment, cleanDesigner, COLUMNS, STATUSES, PROJECT_STATUSES, PRIORITIES, HttpError, cleanProject, cleanTask };
