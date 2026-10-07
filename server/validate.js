'use strict';

const COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' },
  { id: 'done', label: 'Done' },
];
const STATUSES = COLUMNS.map((c) => c.id);
const PROJECT_STATUSES = ['active', 'on_hold', 'completed'];
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
  // Details that come from the client's brief (or that the admin adds later). The budget is private to the admin.
  if ('type' in body) out.type = str(body, 'type', { max: 60 });
  if ('startDate' in body) out.startDate = date(body, 'startDate');
  if ('references' in body) out.references = str(body, 'references', { max: 1000 });
  if ('notes' in body) out.notes = str(body, 'notes', { max: 1000 });
  if ('budget' in body) {
    const b = body.budget;
    if (b === null || b === '' || b === undefined) out.budget = null;
    else {
      const n = typeof b === 'number' ? b : Number(String(b).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, 'Budget must be an amount between 0 and 10,000,000');
      out.budget = Math.round(n * 100) / 100;
    }
  }
  if ('archived' in body) out.archived = body.archived === true;
  if ('recurring' in body) out.recurring = body.recurring === true;
  if (out.recurring) out.dueDate = ''; // a recurring project has no end date
  if (out.startDate && out.dueDate && out.dueDate < out.startDate) throw new HttpError(400, 'The due date must be on or after the start date');
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
  // The author is never taken from the request: it comes from the signed-in session.
  return { text: str(body, 'text', { max: 1000, required: true }), shared: body.shared === true };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

// partial=true (PATCH): only validate fields that are present.
function cleanDesigner(body, partial = false) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const has = (k) => !partial || k in body;
  const out = {};
  if (has('name')) out.name = str(body, 'name', { max: 80, required: true });
  if (has('role')) out.role = str(body, 'role', { max: 80 });
  if (has('email')) {
    const email = str(body, 'email', { max: 120 }).toLowerCase();
    if (email && !EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address');
    out.email = email;
  }
  if ('password' in body && body.password !== '' && body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD || body.password.length > 200) {
      throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
    }
    out.password = body.password;
  }
  if ('projectIds' in body) {
    if (!Array.isArray(body.projectIds) || body.projectIds.length > 200 || body.projectIds.some((x) => typeof x !== 'string' || x.length > 64)) {
      throw new HttpError(400, 'projectIds must be a list of project ids');
    }
    out.projectIds = [...new Set(body.projectIds)];
  }
  return out;
}

const LINK_TYPES = {
  relates: { out: 'relates to', in: 'relates to' },
  blocks: { out: 'blocks', in: 'is blocked by' },
  duplicates: { out: 'duplicates', in: 'is duplicated by' },
};

function cleanLink(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const type = oneOf(body, 'type', Object.keys(LINK_TYPES));
  // inverse: the chosen task is the source ('is blocked by' = the other task blocks this one)
  return { targetId: str(body, 'targetId', { max: 64, required: true }), type, inverse: body.inverse === true };
}

function cleanAttachment(body, maxBytes) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const { safeName, extOf, BLOCKED_EXT } = require('./files');
  const name = safeName(str(body, 'name', { max: 255, required: true }));
  if (BLOCKED_EXT.has(extOf(name))) throw new HttpError(400, `Files of type .${extOf(name)} can’t be attached`);
  const size = body.size;
  if (!Number.isInteger(size) || size < 1) throw new HttpError(400, 'That file is empty');
  if (size > maxBytes) throw new HttpError(413, `Files can be at most ${Math.round(maxBytes / 1048576)} MB`);
  const type = typeof body.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(body.type) ? body.type.slice(0, 100) : 'application/octet-stream';
  return { name, size, type, shared: body.shared === true };
}

// partial=true (PATCH): only validate fields that are present.
function cleanClient(body, partial = false) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const has = (k) => !partial || k in body;
  const out = {};
  if (has('name')) out.name = str(body, 'name', { max: 80, required: true });
  if (has('company')) out.company = str(body, 'company', { max: 80 });
  if (has('email')) {
    const email = str(body, 'email', { max: 120, required: !partial }).toLowerCase();
    if (email && !EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address');
    out.email = email;
  }
  if ('password' in body && body.password !== '' && body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD || body.password.length > 200) {
      throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
    }
    out.password = body.password;
  }
  if ('projectIds' in body) {
    if (!Array.isArray(body.projectIds) || body.projectIds.length > 200 || body.projectIds.some((x) => typeof x !== 'string' || x.length > 64)) {
      throw new HttpError(400, 'projectIds must be a list of project ids');
    }
    out.projectIds = [...new Set(body.projectIds)];
  }
  return out;
}

const REQUEST_TYPES = ['Website design & development', 'Branding & identity', 'Product / app design', 'Other'];
const MAX_REQUEST_DAYS = 730;

/** A project request from the client onboarding flow. The estimate is never taken from the client: the server recomputes it. */
function cleanRequest(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const out = {
    name: str(body, 'name', { max: 120, required: true }),
    type: oneOf(body, 'type', REQUEST_TYPES),
    description: str(body, 'description', { max: 2000, required: true }),
    references: str(body, 'references', { max: 1000 }),
    notes: str(body, 'notes', { max: 1000 }),
    startDate: date(body, 'startDate'),
    dueDate: date(body, 'dueDate'),
  };
  if (!out.startDate || !out.dueDate) throw new HttpError(400, 'Start and due dates are required');
  if (out.dueDate < out.startDate) throw new HttpError(400, 'The due date must be on or after the start date');
  if (!Array.isArray(body.goals)) throw new HttpError(400, 'goals must be a list');
  out.goals = body.goals.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
  if (out.goals.length < 1) throw new HttpError(400, 'Add at least one important goal');
  if (out.goals.length > 8 || out.goals.some((g) => g.length > 200)) throw new HttpError(400, 'Use up to 8 goals of 200 characters or fewer');
  return out;
}

const TIMESHEET_RATE = 30; // euro per hour

/** One day of the timesheet: hours in quarter-hour steps (0 to 24) and a short note about what was done. */
function cleanTimesheetEntry(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
  const hours = typeof body.hours === 'string' && body.hours.trim() !== '' ? Number(body.hours.replace(',', '.')) : body.hours === undefined || body.hours === null || body.hours === '' ? 0 : body.hours;
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24 || Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-9) {
    throw new HttpError(400, 'Hours must be between 0 and 24, in steps of 0.25');
  }
  if (body.off !== undefined && body.off !== null && typeof body.off !== 'boolean') throw new HttpError(400, 'off must be true, false or empty');
  // off: true = day off, false = a working day even though it would normally be off (a weekend), null = the default for that weekday
  return { hours: Math.round(hours * 4) / 4, note: str(body, 'note', { max: 500 }), off: typeof body.off === 'boolean' ? body.off : null };
}
function cleanIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw new HttpError(400, 'Not a valid date');
  return v;
}

module.exports = { cleanTimesheetEntry, cleanIsoDate, TIMESHEET_RATE, cleanRequest, REQUEST_TYPES, MAX_REQUEST_DAYS, cleanClient, cleanAttachment, LINK_TYPES, cleanLink, cleanComment, cleanDesigner, COLUMNS, STATUSES, PROJECT_STATUSES, PRIORITIES, HttpError, cleanProject, cleanTask };
