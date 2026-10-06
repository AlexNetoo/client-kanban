'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, loadDotEnv, ROOT } = require('./config');
const { hashPassword, verifyPassword, signSession, readSession, parseCookies } = require('./auth');
const { Store } = require('./store');
const { FilePersistence, BlobPersistence } = require('./persist');
const { LocalFiles, BlobFiles } = require('./files');
const { COLUMNS, HttpError, cleanProject, cleanTask, cleanComment, cleanDesigner, cleanLink, cleanAttachment, cleanClient, cleanRequest, MAX_REQUEST_DAYS } = require('./validate');
const { estimate, daysBetween } = require('./pricing');
const { assist } = require('./ai');

const crypto = require('crypto');
const PUBLIC_DIR = path.join(ROOT, 'web');
const COOKIE = 'sid';
const MAX_BODY = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8',
};
// Reachable without a session: only what the login page needs. No data lives in these files.
// Built bundles under /assets are public too (static code, no data); the app shell (index.html) is not.
const PUBLIC_FILES = new Set(['/login.html', '/favicon.svg', '/boot.js']);
const isPublic = (rel) => PUBLIC_FILES.has(rel) || rel.startsWith('/assets/');

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.private.blob.vercel-storage.com; connect-src 'self' https://vercel.com; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

// What a client may see. Private notes and internal ids never appear here.
const clientProject = (p) => ({
  name: p.name, client: p.client, status: p.status, dueDate: p.dueDate, recurring: !!p.recurring, summary: p.summary,
  progress: p.progress, counts: p.counts, total: p.total, updatedAt: p.updatedAt,
});
const clientTask = (t) => ({
  id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.dueDate,
  clientUpdate: t.clientUpdate, clientUpdateAt: t.clientUpdateAt,
});

// What a designer may see: no private notes, no client share links.
const staffProject = ({ shareToken, ...p }) => p; // eslint-disable-line no-unused-vars
const staffTask = ({ privateNotes, ...t }) => t; // eslint-disable-line no-unused-vars
// Designers may only change the column/order of a task assigned to them.
// Designers edit the working fields of tasks in their projects; private notes, client updates, deleting and links stay with the admin.
const DESIGNER_TASK_FIELDS = new Set(['title', 'description', 'status', 'priority', 'dueDate', 'assigneeId', 'position']);

function createApp(config) {
  const store = new Store(config.storage === 'blob' ? new BlobPersistence(config.blobPath) : new FilePersistence(config.dataFile), { seedDemo: !!config.seedDemo });
  // Admin sessions carry a fingerprint of the current admin password hash: change the password and every old admin session dies.
  const ownerVersion = crypto.createHash('sha256').update(config.ownerHash).digest('base64url').slice(0, 16);
  const maxBytes = config.attachMaxBytes || 25 * 1024 * 1024;
  const files = config.storage === 'blob' ? new BlobFiles() : new LocalFiles(path.join(path.dirname(config.dataFile), 'uploads'));
  const attempts = new Map(); // limiter key (ip, or email) -> { n, reset }
  const DUMMY_HASH = hashPassword('unused-' + Math.random()); // equalises timing for unknown emails
  const routes = [];

  const route = (method, pattern, access, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, access, handler, raw: !!opts.raw });
  };

  const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'])
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;

  // Designer sessions are re-checked on every request, so removing a designer or changing their
  // password/email revokes access immediately instead of waiting for the cookie to expire.
  const sessionOf = (req) => {
    const s = readSession(parseCookies(req.headers.cookie)[COOKIE], config.secret);
    if (s && (s.role === 'designer' || s.role === 'client')) {
      const acct = s.role === 'designer' ? store.getDesigner(s.uid) : store.getClient(s.uid);
      if (!acct || !acct.passwordHash || acct.tokenVersion !== s.v) return null;
      return { ...s, [s.role]: { id: acct.id, name: acct.name } };
    }
    if (s && s.role === 'owner' && s.v !== ownerVersion) return null;
    return s;
  };

  const tooMany = (key, limit = 10) => { const r = attempts.get(key); return !!r && r.reset > Date.now() && r.n >= limit; };
  const fail = (key) => {
    const now = Date.now(); const r = attempts.get(key);
    attempts.set(key, { n: (r && r.reset > now ? r.n : 0) + 1, reset: r && r.reset > now ? r.reset : now + 15 * 60 * 1000 });
  };

  const cookie = (value, maxAgeSec) => [
    `${COOKIE}=${value}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeSec}`,
    config.secureCookies ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  // ---- Auth ----
  const ADMIN_LIMIT = 5; // the admin sign-in locks much sooner than ordinary accounts
  route('POST', '/api/login', 'public', ({ req, res, body }) => {
    const ip = clientIp(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const as = ['owner', 'designer', 'client'].includes(body.as) ? body.as : null;
    const admin = !email; // no email = the admin password
    const keys = admin ? [`admin:${ip}`, 'admin:any'] : [ip, `email:${email}`];
    if (admin ? (tooMany(keys[0], ADMIN_LIMIT) || tooMany(keys[1], ADMIN_LIMIT * 5)) : keys.some((k) => tooMany(k))) {
      throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
    }
    let session = null;
    if (admin) {
      if (as && as !== 'owner') throw new HttpError(400, 'Designers and clients sign in with their email');
      if (verifyPassword(password, config.ownerHash)) session = { role: 'owner', v: ownerVersion };
    } else {
      // Designers and clients each have their own tab: an account only works on its own.
      const designer = store.findDesignerByEmail(email);
      const client = designer ? null : store.findClientByEmail(email);
      const acct = designer || client;
      const kind = designer ? 'designer' : 'client';
      const ok = verifyPassword(password, acct && acct.passwordHash ? acct.passwordHash : DUMMY_HASH);
      if (acct && acct.passwordHash && ok && (!as || as === kind)) session = { role: kind, uid: acct.id, v: acct.tokenVersion };
    }
    if (!session) {
      keys.forEach(fail);
      throw new HttpError(401, admin ? 'That password isn’t right.' : 'That email or password isn’t right.');
    }
    keys.forEach((k) => attempts.delete(k));
    const exp = Date.now() + config.sessionMs;
    res.setHeader('Set-Cookie', cookie(signSession({ ...session, exp }, config.secret), Math.floor(config.sessionMs / 1000)));
    return { role: session.role };
  });
  route('POST', '/api/logout', 'public', ({ res }) => {
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  });
  route('GET', '/api/session', 'any', ({ session }) => ({ role: session.role, designer: session.designer, client: session.client, expiresAt: session.exp, columns: COLUMNS, maxUploadBytes: maxBytes, ai: !!config.aiKey && session.role !== 'client' }));

  const isDesigner = (s) => s.role === 'designer';
  const isClient = (s) => s.role === 'client';
  const restricted = (s) => s.role !== 'owner';
  // Projects a restricted account can open: a designer's are the ones with a task assigned to them,
  // a client's are the ones the admin assigned. Anything else looks like it doesn't exist.
  const visibleIds = (s) => (isDesigner(s) ? store.projectIdsFor(s.uid) : isClient(s) ? new Set(store.projectsForClient(s.uid).map((p) => p.id)) : null);
  const visibleProject = (s, projectId) => {
    if (restricted(s) && !visibleIds(s).has(projectId)) throw new HttpError(404, 'Project not found');
    return store.getProject(projectId);
  };
  const taskFor = (s, taskId) => {
    const t = store.getTask(taskId);
    visibleProject(s, t.projectId);
    return t;
  };
  // Every task leaves the server through here. Designers and clients never get private notes; links only
  // point at tasks in projects they can open. Clients see only the comments
  // that were shared with them. Files are internal unless shared: clients get only the files marked for them.
  const outTask = (s, t) => {
    const seen = visibleIds(s);
    const links = store.linksFor(t.id).filter((l) => !seen || seen.has(l.task.projectId));
    const attachments = (t.attachments || []).filter((a) => a.status === 'ready' && (!isClient(s) || a.visibility === 'client'))
      .map(({ id, name, size, type, uploadedById, uploadedByName, uploadedAt, visibility }) => ({ id, name, size, type, uploadedById, uploadedByName, uploadedAt, visibility }));
    const comments = isClient(s) ? t.comments.filter((c) => c.visibility === 'client') : t.comments;
    return { ...(restricted(s) ? staffTask(t) : t), links, attachments, comments };
  };

  // ---- Projects: owner sees all; a designer sees only their own, without private notes or share links ----
  route('GET', '/api/projects', 'any', ({ session }) => {
    if (!restricted(session)) return store.listProjects();
    const ids = visibleIds(session);
    return store.listProjects().filter((p) => ids.has(p.id)).map(staffProject);
  });
  route('POST', '/api/projects', 'owner', ({ body }) => ({ status: 201, body: store.createProject(cleanProject(body)) }));
  route('GET', '/api/projects/:id', 'any', ({ params, session }) => {
    const p = visibleProject(session, params.id);
    const tasks = store.tasksFor(p.id);
    return {
      project: restricted(session) ? staffProject(store.withStats(p)) : store.withStats(p),
      tasks: tasks.map((t) => outTask(session, t)),
    };
  });
  route('PATCH', '/api/projects/:id', 'owner', ({ params, body }) =>
    store.updateProject(params.id, cleanProject(body, true), { resetToken: body.resetShareToken === true }));
  route('DELETE', '/api/projects/:id', 'owner', ({ params, defer }) => {
    const atts = store.attachmentsOfTasks(store.tasksFor(params.id).map((t) => t.id));
    store.deleteProject(params.id);
    defer(() => Promise.all(atts.map((a) => files.remove(a))));
    return { ok: true };
  });

  // ---- Tasks: owner edits everything; a designer may add, edit and delete tasks in their projects (not touch private notes / client updates) ----
  // Designers may add tasks to projects they can open. They can't write private notes or client updates, and an unassigned task becomes theirs.
  route('POST', '/api/projects/:id/tasks', 'staff', ({ params, body, session }) => {
    const fields = cleanTask(body);
    if (isDesigner(session)) {
      if (!visibleIds(session).has(params.id)) throw new HttpError(404, 'Project not found');
      delete fields.privateNotes; delete fields.clientUpdate;
      if (!fields.assigneeId) fields.assigneeId = session.uid;
    }
    return { status: 201, body: outTask(session, store.createTask(params.id, fields)) };
  });
  route('PATCH', '/api/tasks/:id', 'staff', ({ params, body, session }) => {
    if (!isDesigner(session)) return outTask(session, store.updateTask(params.id, cleanTask(body, true)));
    taskFor(session, params.id); // 404 unless the task is in one of their projects
    if (Object.keys(body).some((k) => !DESIGNER_TASK_FIELDS.has(k))) throw new HttpError(403, 'Designers can’t change private notes or client updates');
    return outTask(session, store.updateTask(params.id, cleanTask(body, true)));
  });
  route('DELETE', '/api/tasks/:id', 'staff', ({ params, session, defer }) => {
    taskFor(session, params.id); // designers: 404 unless the task is in one of their projects
    const atts = store.attachmentsOfTasks([params.id]);
    store.deleteTask(params.id);
    defer(() => Promise.all(atts.map((a) => files.remove(a))));
    return { ok: true };
  });

  // ---- Attachments. Owner: any task. Designer: attach to tasks assigned to them, remove only their own uploads.
  //      Clients never see attachments. Bytes go straight to storage (Blob) or through /api/uploads (local dev). ----
  const uploaderId = (s) => (isDesigner(s) ? s.uid : 'owner');
  const uploaderName = (s) => (isDesigner(s) ? s.designer.name : 'Admin');
  const attachmentOf = (task, attId) => {
    const att = task.attachments.find((a) => a.id === attId);
    if (!att) throw new HttpError(404, 'Attachment not found');
    return att;
  };

  route('POST', '/api/tasks/:id/attachments', 'staff', async ({ params, body, session, defer }) => {
    const task = taskFor(session, params.id);
    if (isDesigner(session) && task.assigneeId !== session.uid) throw new HttpError(403, 'Only the admin or the assigned designer can attach files');
    const info = cleanAttachment(body, maxBytes);
    const stale = store.purgeStaleAttachments();
    defer(() => Promise.all(stale.map((a) => files.remove(a))));
    const { shared, ...meta } = info;
    const { att } = store.addPendingAttachment(task.id, { ...meta, visibility: shared ? 'client' : 'internal', uploadedById: uploaderId(session), uploadedByName: uploaderName(session) });
    return { status: 201, body: { attachmentId: att.id, upload: await files.createUpload(att, maxBytes) } };
  });

  route('POST', '/api/tasks/:id/attachments/:aid/complete', 'staff', async ({ params, session }) => {
    const task = taskFor(session, params.id);
    const att = attachmentOf(task, params.aid);
    if (isDesigner(session) && att.uploadedById !== session.uid) throw new HttpError(403, 'Not your upload');
    if (att.status === 'ready') return outTask(session, task);
    const stat = await files.stat(att);
    if (!stat) throw new HttpError(409, 'The upload didn’t finish. Please try again.');
    if (stat.size > maxBytes) { // belt and braces: the signed URL already enforces this
      await files.remove(att);
      store.removeAttachment(task.id, att.id);
      return { status: 413, body: { error: `Files can be at most ${Math.round(maxBytes / 1048576)} MB` } };
    }
    return outTask(session, store.completeAttachment(att.id, stat.size));
  });

  // Authorise here, then hand the browser a short-lived signed URL (Blob) or stream from disk (local).
  route('GET', '/api/attachments/:aid/file', 'any', async ({ params, session }) => {
    const found = store.findAttachment(params.aid);
    if (!found || found.att.status !== 'ready') throw new HttpError(404, 'Attachment not found');
    visibleProject(session, found.task.projectId); // designers and clients get a 404 for projects they can't open
    if (isClient(session) && found.att.visibility !== 'client') throw new HttpError(404, 'Attachment not found'); // internal files don't exist for clients
    const { att } = found;
    if (files.kind === 'blob') {
      const url = await files.downloadUrl(att);
      return { after: (res) => { res.writeHead(302, { Location: url, ...SECURITY_HEADERS }); res.end(); } };
    }
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(att.name)}`;
    return { after: (res) => files.download(att, res, { ...SECURITY_HEADERS, 'Content-Disposition': disposition }) };
  });

  route('PUT', '/api/uploads/:aid', 'staff', ({ params, req, session }) => { // local development only
    if (files.kind !== 'local') throw new HttpError(404, 'Not found');
    const found = store.findAttachment(params.aid);
    if (!found || found.att.status !== 'pending') throw new HttpError(404, 'Upload not found');
    if (found.att.uploadedById !== uploaderId(session)) throw new HttpError(403, 'Not your upload');
    visibleProject(session, found.task.projectId);
    const { att } = found;
    return {
      after: async (res) => {
        try { sendJson(res, 200, { ok: true, size: await files.receive(att, req, att.size) }); }
        catch (e) { throw e.tooLarge ? new HttpError(413, 'That file is larger than it was declared to be') : e; }
      },
    };
  }, { raw: true });

  // Share a file with the client (or make it internal again). Admin: any file. Designer: only files they uploaded.
  route('PATCH', '/api/tasks/:id/attachments/:aid', 'staff', ({ params, body, session }) => {
    const task = taskFor(session, params.id);
    const att = attachmentOf(task, params.aid);
    if (isDesigner(session) && att.uploadedById !== session.uid) throw new HttpError(403, 'You can only change sharing on files you uploaded');
    if (typeof body.shared !== 'boolean') throw new HttpError(400, 'shared must be true or false');
    return outTask(session, store.setAttachmentVisibility(task.id, att.id, body.shared ? 'client' : 'internal'));
  });

  route('DELETE', '/api/tasks/:id/attachments/:aid', 'staff', ({ params, session, defer }) => {
    const task = taskFor(session, params.id);
    const att = attachmentOf(task, params.aid);
    if (isDesigner(session) && att.uploadedById !== session.uid) throw new HttpError(403, 'You can only remove files you uploaded');
    store.removeAttachment(task.id, att.id);
    defer(() => files.remove(att));
    return outTask(session, store.getTask(task.id));
  });

  // ---- Task links (owner edits; designers only ever see links to projects they can access) ----
  route('POST', '/api/tasks/:id/links', 'owner', ({ params, body, session }) => {
    store.addLink(params.id, cleanLink(body));
    return { status: 201, body: outTask(session, store.getTask(params.id)) };
  });
  route('DELETE', '/api/tasks/:id/links/:lid', 'owner', ({ params, session }) => {
    store.deleteLink(params.id, params.lid);
    return outTask(session, store.getTask(params.id));
  });
  route('GET', '/api/task-search', 'owner', ({ req }) => {
    const u = new URL(req.url, 'http://localhost');
    return store.searchTasks(u.searchParams.get('q'), u.searchParams.get('exclude'));
  });

  // ---- Designers (accounts). Everyone signed in as staff can list names; only the owner manages logins. ----
  route('GET', '/api/designers', 'any', ({ session }) => store.listDesigners({ full: !restricted(session) }));
  route('POST', '/api/designers', 'owner', ({ body }) => {
    const { password, ...fields } = cleanDesigner(body);
    return { status: 201, body: store.createDesigner({ ...fields, passwordHash: password ? hashPassword(password) : '' }) };
  });
  route('PATCH', '/api/designers/:id', 'owner', ({ params, body }) => {
    if (body && body.removeLogin === true) return store.updateDesigner(params.id, { email: '', passwordHash: '' }); // keeps the person and their history, drops access
    const { password, ...fields } = cleanDesigner(body, true);
    return store.updateDesigner(params.id, { ...fields, ...(password ? { passwordHash: hashPassword(password) } : {}) });
  });
  route('DELETE', '/api/designers/:id', 'owner', ({ params }) => { store.deleteDesigner(params.id); return { ok: true }; });

  // ---- AI assistant (admin and designers): proposes task changes for a project; the browser applies the approved ones ----
  const aiUse = new Map(); // best-effort per-user limit (per server instance): 30 requests an hour
  route('POST', '/api/ai/assist', 'staff', async ({ body, session }) => {
    if (!config.aiKey) throw new HttpError(503, 'The AI assistant isn’t set up yet. The admin needs to add ANTHROPIC_API_KEY.');
    const key = `${session.role}:${session.uid || 'owner'}`;
    const now = Date.now();
    const recent = (aiUse.get(key) || []).filter((t) => now - t < 3600e3);
    if (recent.length >= 30) throw new HttpError(429, 'You’ve reached the hourly limit for the assistant. Try again later.');
    aiUse.set(key, [...recent, now]);
    if (!body || typeof body.projectId !== 'string' || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) throw new HttpError(400, 'Write a request of up to 2000 characters.');
    if (restricted(session) && !visibleIds(session).has(body.projectId)) throw new HttpError(404, 'Project not found');
    const project = store.getProject(body.projectId);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .filter((h) => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'assistant')).map((h) => ({ role: h.role, text: h.text }));
    const input = { project: { ...project }, tasks: store.tasksFor(project.id).map((t) => ({ ...t })), designers: store.listDesigners(), history, message: body.message.trim(), today: new Date().toISOString().slice(0, 10) };
    // The slow model call runs after the data transaction ends, so it never blocks other requests.
    return { after: async (res) => sendJson(res, 200, await assist({ key: config.aiKey, model: config.aiModel, baseUrl: config.aiBaseUrl }, input)) };
  });

  // ---- Euro to US dollar rate for the estimate's currency switch (ECB reference rate via frankfurter.dev, cached 6 hours) ----
  let fxCache = null;
  route('GET', '/api/fx', 'public', async () => {
    if (fxCache && Date.now() - fxCache.at < 6 * 3600e3) return fxCache.value;
    try {
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (!r.ok || !(j.rates && j.rates.USD > 0)) throw new Error('bad rate');
      fxCache = { at: Date.now(), value: { rate: j.rates.USD, date: j.date, approximate: false } };
      return fxCache.value;
    } catch {
      return fxCache ? fxCache.value : { rate: 1.08, date: '', approximate: true }; // keep the last good rate, else a rough one, clearly marked
    }
  });

  // ---- Project requests: clients submit a brief (the server prices it), the admin accepts or declines ----
  route('GET', '/api/requests', 'viewer', ({ session }) => store.listRequests(isClient(session) ? session.uid : undefined));
  route('POST', '/api/requests', 'client', ({ body, session }) => {
    const fields = cleanRequest(body);
    const days = daysBetween(fields.startDate, fields.dueDate);
    if (days > MAX_REQUEST_DAYS) throw new HttpError(400, 'Projects longer than two years need a conversation first. Shorten the dates or contact us.');
    const client = store.getClient(session.uid);
    if (!client) throw new HttpError(401, 'Please sign in');
    return { status: 201, body: store.createRequest(client, fields, estimate(days)) };
  });
  route('POST', '/api/requests/:id/accept', 'owner', ({ params }) => store.acceptRequest(params.id));
  route('POST', '/api/requests/:id/decline', 'owner', ({ params }) => store.declineRequest(params.id));
  route('DELETE', '/api/requests/:id', 'owner', ({ params }) => { store.deleteRequest(params.id); return { ok: true }; });

  // ---- Client accounts (admin only): each client has their own login and sees only the projects assigned to them ----
  route('GET', '/api/clients', 'owner', () => store.listClients());
  route('POST', '/api/clients', 'owner', ({ body }) => {
    const { password, ...fields } = cleanClient(body);
    if (!password) throw new HttpError(400, 'Set a password for this client');
    return { status: 201, body: store.createClient({ ...fields, passwordHash: hashPassword(password) }) };
  });
  route('PATCH', '/api/clients/:id', 'owner', ({ params, body }) => {
    const { password, ...fields } = cleanClient(body, true);
    return store.updateClient(params.id, { ...fields, ...(password ? { passwordHash: hashPassword(password) } : {}) });
  });
  route('DELETE', '/api/clients/:id', 'owner', ({ params }) => { store.deleteClient(params.id); return { ok: true }; });

  // Designers and clients change their own password (the admin's lives in the environment). Other sessions are revoked.
  route('POST', '/api/me/password', 'any', ({ res, body, session }) => {
    if (session.role === 'owner') throw new HttpError(403, 'The admin password is changed in the server environment settings');
    const get = session.role === 'designer' ? (id) => store.getDesigner(id) : (id) => store.getClient(id);
    const update = session.role === 'designer' ? (id, h) => store.updateDesigner(id, { passwordHash: h }) : (id, h) => store.updateClient(id, { passwordHash: h });
    const acct = get(session.uid);
    const current = typeof body.current === 'string' ? body.current : '';
    if (tooMany(`pw:${acct.id}`)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    if (!verifyPassword(current, acct.passwordHash)) { fail(`pw:${acct.id}`); throw new HttpError(401, 'Your current password isn’t right.'); }
    const { password } = cleanDesigner({ password: body.next }, true);
    if (!password) throw new HttpError(400, 'Password must be at least 10 characters');
    update(acct.id, hashPassword(password));
    const exp = Date.now() + config.sessionMs;
    res.setHeader('Set-Cookie', cookie(signSession({ role: session.role, uid: acct.id, v: get(acct.id).tokenVersion, exp }, config.secret), Math.floor(config.sessionMs / 1000)));
    return { ok: true };
  });

  // ---- Comments: internal, authored by whoever is signed in (never taken from the request) ----
  route('POST', '/api/tasks/:id/comments', 'any', ({ params, body, session }) => {
    taskFor(session, params.id);
    const { text, shared } = cleanComment(body);
    // Clients' comments are always shared; admin and designers choose (internal unless they tick "share").
    const visibility = isClient(session) || shared ? 'client' : 'internal';
    const authorId = restricted(session) ? session.uid : 'owner';
    return { status: 201, body: outTask(session, store.addComment(params.id, { text, authorId, authorRole: session.role === 'owner' ? 'owner' : session.role, visibility })) };
  });
  route('DELETE', '/api/tasks/:id/comments/:cid', 'any', ({ params, session }) => {
    const task = taskFor(session, params.id);
    const comment = task.comments.find((c) => c.id === params.cid);
    if (comment && restricted(session) && comment.authorId !== session.uid) throw new HttpError(403, 'You can only delete your own comments');
    return outTask(session, store.deleteComment(params.id, params.cid));
  });

  // ---- Client view (admin preview, or a client account assigned to the project). Addressed by unguessable share token. ----
  route('GET', '/api/client/:token', 'viewer', ({ params, session }) => {
    const raw = store.getProjectByToken(params.token);
    // A client account can open only the projects assigned to it; anything else looks like it doesn't exist.
    if (session.role === 'client' && !store.projectsForClient(session.uid).some((x) => x.id === raw.id)) throw new HttpError(404, 'Project not found');
    const p = store.withStats(raw);
    return { project: clientProject(p), tasks: store.tasksFor(p.id).map(clientTask) };
  });

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS });
    res.end(JSON.stringify(data));
  };

  async function handleApi(req, res, pathname) {
    const route_ = routes.find((r) => r.method === req.method && r.re.test(pathname));
    if (!route_) {
      if (routes.some((r) => r.re.test(pathname))) throw new HttpError(405, 'Method not allowed');
      throw new HttpError(404, 'Not found');
    }
    let body = {};
    if (req.method !== 'GET') {
      // CSRF defence in depth (cookie is also SameSite=Strict): same-origin + JSON only.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
      if (!route_.raw) {
        if (req.method !== 'DELETE' && !/^application\/json/i.test(req.headers['content-type'] || '')) {
          throw new HttpError(415, 'Expected JSON');
        }
        body = await readBody(req); // read once: the step below may run again if another instance wrote first
      }
    }
    const match = route_.re.exec(pathname);
    const params = Object.fromEntries(route_.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    // Everything that touches data (including checking a designer's session) runs inside one transaction.
    // Side effects on files (deleting blobs, streaming a download) are queued and run only after the commit succeeds.
    const { result, deferred } = await store.transact(async () => {
      const deferred = [];
      const session = sessionOf(req);
      if (route_.access !== 'public') {
        if (!session) throw new HttpError(401, 'Please sign in');
        const allowed = {
          any: ['owner', 'client', 'designer'], staff: ['owner', 'designer'], owner: ['owner'], viewer: ['owner', 'client'], client: ['client'],
        }[route_.access];
        if (!allowed.includes(session.role)) throw new HttpError(403, 'Not allowed');
      }
      const result = await route_.handler({ req, res, params, body, session, defer: (fn) => deferred.push(fn) });
      return { result, deferred };
    });
    for (const fn of deferred) { try { await fn(); } catch (e) { console.error('post-commit step failed', e); } }
    if (result && typeof result.after === 'function') return result.after(res);
    if (result && result.status && result.body !== undefined) sendJson(res, result.status, result.body);
    else sendJson(res, 200, result);
  }

  // Owner and client sessions are self-contained; a designer's must be checked against the stored account.
  async function sessionForPage(req) {
    const raw = readSession(parseCookies(req.headers.cookie)[COOKIE], config.secret);
    if (!raw) return null;
    return raw.role === 'owner' ? (raw.v === ownerVersion ? raw : null) : store.transact(() => sessionOf(req));
  }

  async function serveStatic(req, res, pathname) {
    const session = await sessionForPage(req);
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (rel === '/login' || rel === '/designer') rel = '/login.html';
    // /admin: the admin console for a signed-in admin, otherwise the admin sign-in (same page as /login, admin mode).
    const adminPage = pathname === '/admin' || pathname === '/admin/';
    if (adminPage) rel = session && session.role === 'owner' ? '/index.html' : '/login.html';
    // /demo: the app shell for the in-browser demo project. It is public because it carries no data: the demo is answered
    // entirely in the browser and every real API call still needs a real session.
    const demoPage = pathname === '/demo' || pathname === '/demo/';
    if (demoPage) rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    const open = isPublic(rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      return res.end('Not found');
    }
    if (!open && !session && !adminPage && !demoPage) {
      // Fragment (#/c/token) is preserved by browsers across this redirect.
      res.writeHead(302, { Location: '/login', ...SECURITY_HEADERS });
      return res.end();
    }
    if (rel === '/login.html' && session && !adminPage) {
      res.writeHead(302, { Location: '/', ...SECURITY_HEADERS });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...SECURITY_HEADERS });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
      else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, pathname);
      else throw new HttpError(405, 'Method not allowed');
    } catch (err) {
      if (res.headersSent) return res.end();
      if (!(err instanceof HttpError)) console.error(err);
      sendJson(res, err.status || 500, { error: err instanceof HttpError ? err.message : 'Something went wrong' });
    }
  });

  return { server, store };
}

module.exports = { createApp };

if (require.main === module) {
  loadDotEnv();
  let config;
  try { config = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  const { server } = createApp(config);
  server.listen(config.port, () => console.log(`Client kanban running at http://localhost:${config.port}`));
}
