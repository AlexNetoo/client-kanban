'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, loadDotEnv, ROOT } = require('./config');
const { verifyPassword, signSession, readSession, parseCookies } = require('./auth');
const { Store } = require('./store');
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
  name: p.name, client: p.client, status: p.status, dueDate: p.dueDate, summary: p.summary,
  progress: p.progress, counts: p.counts, total: p.total, updatedAt: p.updatedAt,
});
const clientTask = (t) => ({
  id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.dueDate,
  clientUpdate: t.clientUpdate, clientUpdateAt: t.clientUpdateAt,
});

function createApp(config) {
  const store = new Store(config.dataFile);
  const attempts = new Map(); // ip -> { n, reset }
  const routes = [];

  const route = (method, pattern, access, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, access, handler });
  };

  const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'])
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;

  const sessionOf = (req) => readSession(parseCookies(req.headers.cookie)[COOKIE], config.secret);

  const cookie = (value, maxAgeSec) => [
    `${COOKIE}=${value}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAgeSec}`,
    config.secureCookies ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  // ---- Auth ----
  route('POST', '/api/login', 'public', ({ req, res, body }) => {
    const ip = clientIp(req);
    const now = Date.now();
    const rec = attempts.get(ip);
    if (rec && rec.reset > now && rec.n >= 10) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const password = typeof body.password === 'string' ? body.password : '';
    const role = verifyPassword(password, config.ownerHash) ? 'owner'
      : (config.clientHash && verifyPassword(password, config.clientHash)) ? 'client' : null;
    if (!role) {
      attempts.set(ip, { n: (rec && rec.reset > now ? rec.n : 0) + 1, reset: rec && rec.reset > now ? rec.reset : now + 15 * 60 * 1000 });
      throw new HttpError(401, 'That password isn’t right.');
    }
    attempts.delete(ip);
    const token = signSession({ role, exp: now + config.sessionMs }, config.secret);
    res.setHeader('Set-Cookie', cookie(token, Math.floor(config.sessionMs / 1000)));
    return { role };
  });
  route('POST', '/api/logout', 'public', ({ res }) => {
    res.setHeader('Set-Cookie', cookie('', 0));
    return { ok: true };
  });
  route('GET', '/api/session', 'any', ({ session }) => ({ role: session.role, expiresAt: session.exp, columns: COLUMNS }));

  // ---- Owner: projects ----
  route('GET', '/api/projects', 'owner', () => store.listProjects());
  route('POST', '/api/projects', 'owner', ({ body }) => ({ status: 201, body: store.createProject(cleanProject(body)) }));
  route('GET', '/api/projects/:id', 'owner', ({ params }) => {
    const p = store.getProject(params.id);
    return { project: store.withStats(p), tasks: store.tasksFor(p.id) };
  });
  route('PATCH', '/api/projects/:id', 'owner', ({ params, body }) =>
    store.updateProject(params.id, cleanProject(body, true), { resetToken: body.resetShareToken === true }));
  route('DELETE', '/api/projects/:id', 'owner', ({ params }) => { store.deleteProject(params.id); return { ok: true }; });

  // ---- Owner: tasks ----
  route('POST', '/api/projects/:id/tasks', 'owner', ({ params, body }) =>
    ({ status: 201, body: store.createTask(params.id, cleanTask(body)) }));
  route('PATCH', '/api/tasks/:id', 'owner', ({ params, body }) => store.updateTask(params.id, cleanTask(body, true)));
  route('DELETE', '/api/tasks/:id', 'owner', ({ params }) => { store.deleteTask(params.id); return { ok: true }; });

  // ---- Owner: designers and task comments (internal; never part of the client view) ----
  route('GET', '/api/designers', 'owner', () => store.listDesigners());
  route('POST', '/api/designers', 'owner', ({ body }) => ({ status: 201, body: store.createDesigner(cleanDesigner(body)) }));
  route('DELETE', '/api/designers/:id', 'owner', ({ params }) => { store.deleteDesigner(params.id); return { ok: true }; });
  route('POST', '/api/tasks/:id/comments', 'owner', ({ params, body }) => ({ status: 201, body: store.addComment(params.id, cleanComment(body)) }));
  route('DELETE', '/api/tasks/:id/comments/:cid', 'owner', ({ params }) => store.deleteComment(params.id, params.cid));

  // ---- Client view (owner or client session). Addressed by unguessable share token. ----
  route('GET', '/api/client/:token', 'any', ({ params }) => {
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
    const session = sessionOf(req);
    const route_ = routes.find((r) => r.method === req.method && r.re.test(pathname));
    if (!route_) {
      if (routes.some((r) => r.re.test(pathname))) throw new HttpError(405, 'Method not allowed');
      throw new HttpError(404, 'Not found');
    }
    if (route_.access !== 'public') {
      if (!session) throw new HttpError(401, 'Please sign in');
      if (route_.access === 'owner' && session.role !== 'owner') throw new HttpError(403, 'Not allowed');
    }
    let body = {};
    if (req.method !== 'GET') {
      // CSRF defence in depth (cookie is also SameSite=Strict): same-origin + JSON only.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
      if (req.method !== 'DELETE' && !/^application\/json/i.test(req.headers['content-type'] || '')) {
        throw new HttpError(415, 'Expected JSON');
      }
      body = await readBody(req);
    }
    const match = route_.re.exec(pathname);
    const params = Object.fromEntries(route_.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    const result = await route_.handler({ req, res, params, body, session });
    if (result && result.status && result.body !== undefined) sendJson(res, result.status, result.body);
    else sendJson(res, 200, result);
  }

  function serveStatic(req, res, pathname) {
    const session = sessionOf(req);
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
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, pathname);
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
