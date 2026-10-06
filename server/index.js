'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, loadDotEnv, ROOT } = require('./config');
const { hashPassword, verifyPassword, signSession, readSession, parseCookies } = require('./auth');
const { Store } = require('./store');
const { FilePersistence, BlobPersistence } = require('./persist');
const { COLUMNS, HttpError, cleanProject, cleanTask, cleanComment, cleanDesigner } = require('./validate');

const PUBLIC_DIR = path.join(ROOT, 'web');
const COOKIE = 'sid';
const MAX_BODY = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8',
};
// Reachable without a session: only what the login page needs. No data lives in these files.
// Built bundles under /assets are public too (static code, no data); the app shell (index.html) is not.
const PUBLIC_FILES = new Set(['/login.html', '/favicon.svg']);
const isPublic = (rel) => PUBLIC_FILES.has(rel) || rel.startsWith('/assets/');

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
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
const DESIGNER_TASK_FIELDS = new Set(['status', 'position']);

function createApp(config) {
  const store = new Store(config.storage === 'blob' ? new BlobPersistence(config.blobPath) : new FilePersistence(config.dataFile));
  const attempts = new Map(); // limiter key (ip, or email) -> { n, reset }
  const DUMMY_HASH = hashPassword('unused-' + Math.random()); // equalises timing for unknown emails
  const routes = [];

  const route = (method, pattern, access, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, access, handler });
  };

  const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'])
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;

  // Designer sessions are re-checked on every request, so removing a designer or changing their
  // password/email revokes access immediately instead of waiting for the cookie to expire.
  const sessionOf = (req) => {
    const s = readSession(parseCookies(req.headers.cookie)[COOKIE], config.secret);
    if (s && s.role === 'designer') {
      const d = store.getDesigner(s.uid);
      if (!d || !d.passwordHash || d.tokenVersion !== s.v) return null;
      return { ...s, designer: { id: d.id, name: d.name } };
    }
    return s;
  };

  const tooMany = (key) => { const r = attempts.get(key); return r && r.reset > Date.now() && r.n >= 10; };
  const fail = (key) => {
    const now = Date.now(); const r = attempts.get(key);
    attempts.set(key, { n: (r && r.reset > now ? r.n : 0) + 1, reset: r && r.reset > now ? r.reset : now + 15 * 60 * 1000 });
  };

  const cookie = (value, maxAgeSec) => [
    `${COOKIE}=${value}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeSec}`,
    config.secureCookies ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  // ---- Auth ----
  route('POST', '/api/login', 'public', ({ req, res, body }) => {
    const ip = clientIp(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const keys = email ? [ip, `email:${email}`] : [ip];
    if (keys.some(tooMany)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    let session = null;
    if (email) {
      const d = store.findDesignerByEmail(email);
      const ok = verifyPassword(password, d && d.passwordHash ? d.passwordHash : DUMMY_HASH);
      if (d && d.passwordHash && ok) session = { role: 'designer', uid: d.id, v: d.tokenVersion };
    } else {
      // The sign-in tab says which account type is being claimed; a password only works on its own tab.
      const as = body.as === 'owner' || body.as === 'client' ? body.as : null;
      if ((!as || as === 'owner') && verifyPassword(password, config.ownerHash)) session = { role: 'owner' };
      else if ((!as || as === 'client') && config.clientHash && verifyPassword(password, config.clientHash)) session = { role: 'client' };
    }
    if (!session) {
      keys.forEach(fail);
      throw new HttpError(401, email ? 'That email or password isn’t right.' : 'That password isn’t right.');
    }
    attempts.delete(ip);
    if (email) attempts.delete(`email:${email}`);
    const exp = Date.now() + config.sessionMs;
    res.setHeader('Set-Cookie', cookie(signSession({ ...session, exp }, config.secret), Math.floor(config.sessionMs / 1000)));
    return { role: session.role };
  });
  route('POST', '/api/logout', 'public', ({ res }) => {
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  });
  route('GET', '/api/session', 'any', ({ session }) => ({ role: session.role, designer: session.designer, expiresAt: session.exp, columns: COLUMNS }));

  const isDesigner = (s) => s.role === 'designer';
  // A designer can reach a project only if they have a task in it; anything else looks like it doesn't exist.
  const visibleProject = (s, projectId) => {
    if (!isDesigner(s)) return store.getProject(projectId);
    if (!store.projectIdsFor(s.uid).has(projectId)) throw new HttpError(404, 'Project not found');
    return store.getProject(projectId);
  };
  const taskFor = (s, taskId) => {
    const t = store.getTask(taskId);
    visibleProject(s, t.projectId);
    return t;
  };
  const outTask = (s, t) => (isDesigner(s) ? staffTask(t) : t);

  // ---- Projects: owner sees all; a designer sees only their own, without private notes or share links ----
  route('GET', '/api/projects', 'staff', ({ session }) => {
    if (!isDesigner(session)) return store.listProjects();
    const ids = store.projectIdsFor(session.uid);
    return store.listProjects().filter((p) => ids.has(p.id)).map(staffProject);
  });
  route('POST', '/api/projects', 'owner', ({ body }) => ({ status: 201, body: store.createProject(cleanProject(body)) }));
  route('GET', '/api/projects/:id', 'staff', ({ params, session }) => {
    const p = visibleProject(session, params.id);
    const tasks = store.tasksFor(p.id);
    return isDesigner(session)
      ? { project: staffProject(store.withStats(p)), tasks: tasks.map(staffTask) }
      : { project: store.withStats(p), tasks };
  });
  route('PATCH', '/api/projects/:id', 'owner', ({ params, body }) =>
    store.updateProject(params.id, cleanProject(body, true), { resetToken: body.resetShareToken === true }));
  route('DELETE', '/api/projects/:id', 'owner', ({ params }) => { store.deleteProject(params.id); return { ok: true }; });

  // ---- Tasks: owner edits everything; a designer may only move their own assigned tasks ----
  route('POST', '/api/projects/:id/tasks', 'owner', ({ params, body }) =>
    ({ status: 201, body: store.createTask(params.id, cleanTask(body)) }));
  route('PATCH', '/api/tasks/:id', 'staff', ({ params, body, session }) => {
    if (!isDesigner(session)) return store.updateTask(params.id, cleanTask(body, true));
    const task = taskFor(session, params.id);
    if (task.assigneeId !== session.uid) throw new HttpError(403, 'You can only move tasks assigned to you');
    if (Object.keys(body).some((k) => !DESIGNER_TASK_FIELDS.has(k))) throw new HttpError(403, 'Designers can only move tasks between columns');
    const { status, position } = cleanTask(body, true);
    return staffTask(store.updateTask(params.id, { status, position }));
  });
  route('DELETE', '/api/tasks/:id', 'owner', ({ params }) => { store.deleteTask(params.id); return { ok: true }; });

  // ---- Designers (accounts). Everyone signed in as staff can list names; only the owner manages logins. ----
  route('GET', '/api/designers', 'staff', ({ session }) => store.listDesigners({ full: !isDesigner(session) }));
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

  // A designer changes their own password (the owner's lives in the environment). Other sessions are revoked.
  route('POST', '/api/me/password', 'staff', ({ res, body, session }) => {
    if (!isDesigner(session)) throw new HttpError(403, 'The freelancer password is changed in the server environment settings');
    const d = store.getDesigner(session.uid);
    const current = typeof body.current === 'string' ? body.current : '';
    if (tooMany(`pw:${d.id}`)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    if (!verifyPassword(current, d.passwordHash)) { fail(`pw:${d.id}`); throw new HttpError(401, 'Your current password isn’t right.'); }
    const { password } = cleanDesigner({ password: body.next }, true);
    if (!password) throw new HttpError(400, 'Password must be at least 10 characters');
    store.updateDesigner(d.id, { passwordHash: hashPassword(password) });
    const exp = Date.now() + config.sessionMs;
    res.setHeader('Set-Cookie', cookie(signSession({ role: 'designer', uid: d.id, v: store.getDesigner(d.id).tokenVersion, exp }, config.secret), Math.floor(config.sessionMs / 1000)));
    return { ok: true };
  });

  // ---- Comments: internal, authored by whoever is signed in (never taken from the request) ----
  route('POST', '/api/tasks/:id/comments', 'staff', ({ params, body, session }) => {
    taskFor(session, params.id);
    const { text } = cleanComment(body);
    return { status: 201, body: outTask(session, store.addComment(params.id, { text, authorId: isDesigner(session) ? session.uid : 'owner' })) };
  });
  route('DELETE', '/api/tasks/:id/comments/:cid', 'staff', ({ params, session }) => {
    const task = taskFor(session, params.id);
    const comment = task.comments.find((c) => c.id === params.cid);
    if (comment && isDesigner(session) && comment.authorId !== session.uid) throw new HttpError(403, 'You can only delete your own comments');
    return outTask(session, store.deleteComment(params.id, params.cid));
  });

  // ---- Client view (owner or client session). Addressed by unguessable share token. ----
  route('GET', '/api/client/:token', 'viewer', ({ params }) => {
    const p = store.withStats(store.getProjectByToken(params.token));
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
      if (req.method !== 'DELETE' && !/^application\/json/i.test(req.headers['content-type'] || '')) {
        throw new HttpError(415, 'Expected JSON');
      }
      body = await readBody(req); // read once: the step below may run again if another instance wrote first
    }
    const match = route_.re.exec(pathname);
    const params = Object.fromEntries(route_.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    // Everything that touches data (including checking a designer's session) runs inside one transaction.
    const result = await store.transact(async () => {
      const session = sessionOf(req);
      if (route_.access !== 'public') {
        if (!session) throw new HttpError(401, 'Please sign in');
        const allowed = {
          any: ['owner', 'client', 'designer'], staff: ['owner', 'designer'], owner: ['owner'], viewer: ['owner', 'client'],
        }[route_.access];
        if (!allowed.includes(session.role)) throw new HttpError(403, 'Not allowed');
      }
      return route_.handler({ req, res, params, body, session });
    });
    if (result && result.status && result.body !== undefined) sendJson(res, result.status, result.body);
    else sendJson(res, 200, result);
  }

  // Owner and client sessions are self-contained; a designer's must be checked against the stored account.
  async function sessionForPage(req) {
    const raw = readSession(parseCookies(req.headers.cookie)[COOKIE], config.secret);
    if (!raw) return null;
    return raw.role === 'designer' ? store.transact(() => sessionOf(req)) : raw;
  }

  async function serveStatic(req, res, pathname) {
    const session = await sessionForPage(req);
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (rel === '/login') rel = '/login.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    const open = isPublic(rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      return res.end('Not found');
    }
    if (!open && !session) {
      // Fragment (#/c/token) is preserved by browsers across this redirect.
      res.writeHead(302, { Location: '/login', ...SECURITY_HEADERS });
      return res.end();
    }
    if (rel === '/login.html' && session) {
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
