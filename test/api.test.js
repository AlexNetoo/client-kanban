'use strict';
const { test: rawTest } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server/index');
const { hashPassword } = require('../server/auth');

const OWNER_PW = 'owner-test-password';
const CLIENT_PW = 'client-test-password';
let server, base, dir;

const ready = (async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-'));
  ({ server } = createApp({
    ownerHash: hashPassword(OWNER_PW), clientHash: hashPassword(CLIENT_PW), secret: 'x'.repeat(40),
    sessionMs: 3600_000, dataFile: path.join(dir, 'db.json'), secureCookies: false, trustProxy: false,
  }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
})();
// Node 19's runner has no top-level hooks: every test awaits setup; a final test tears down.
const test = (name, fn) => rawTest(name, async () => { await ready; await fn(); });

async function call(method, url, { body, cookie } = {}) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, json, text };
}
async function login(password) {
  const { res, json } = await call('POST', '/api/login', { body: { password } });
  return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

test('data routes reject unauthenticated requests', async () => {
  for (const [m, u] of [['GET', '/api/projects'], ['POST', '/api/projects'], ['GET', '/api/session'], ['PATCH', '/api/tasks/x'], ['DELETE', '/api/tasks/x'], ['GET', '/api/client/abc']]) {
    const { res } = await call(m, u, { body: m === 'GET' || m === 'DELETE' ? undefined : {} });
    assert.strictEqual(res.status, 401, `${m} ${u}`);
  }
});

test('pages redirect to login without a session; login assets are public', async () => {
  const r = await call('GET', '/');
  assert.strictEqual(r.res.status, 302);
  assert.strictEqual(r.res.headers.get('location'), '/login');
  assert.strictEqual((await call('GET', '/js/app.js')).res.status, 302);
  assert.strictEqual((await call('GET', '/login')).res.status, 200);
});

test('wrong password is rejected; forged/expired cookies are rejected', async () => {
  assert.strictEqual((await login('nope')).status, 401);
  assert.strictEqual((await call('GET', '/api/projects', { cookie: 'sid=eyJyb2xlIjoib3duZXIifQ.bad' })).res.status, 401);
});

test('owner can list projects and sees private notes; seed present', async () => {
  const { status, cookie } = await login(OWNER_PW);
  assert.strictEqual(status, 200);
  const { json: projects } = await call('GET', '/api/projects', { cookie });
  assert.ok(projects.length >= 3);
  const { json } = await call('GET', `/api/projects/${projects[0].id}`, { cookie });
  assert.ok(json.tasks.some((t) => t.privateNotes));
});

test('client session cannot reach owner routes and never receives private notes', async () => {
  const owner = await login(OWNER_PW);
  const { json: projects } = await call('GET', '/api/projects', { cookie: owner.cookie });
  const client = await login(CLIENT_PW);
  assert.strictEqual(client.json.role, 'client');
  assert.strictEqual((await call('GET', '/api/projects', { cookie: client.cookie })).res.status, 403);
  assert.strictEqual((await call('GET', `/api/projects/${projects[0].id}`, { cookie: client.cookie })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/projects/${projects[0].id}`, { cookie: client.cookie, body: { name: 'x' } })).res.status, 403);
  const view = await call('GET', `/api/client/${projects[0].shareToken}`, { cookie: client.cookie });
  assert.strictEqual(view.res.status, 200);
  assert.ok(!view.text.includes('privateNotes'));
  assert.ok(!view.text.includes('shareToken'));
  assert.strictEqual((await call('GET', '/api/client/' + projects[0].id, { cookie: client.cookie })).res.status, 404);
});

test('project + task CRUD, move, archive hides from client, delete cascades', async () => {
  const { cookie } = await login(OWNER_PW);
  const created = (await call('POST', '/api/projects', { cookie, body: { name: 'Test', client: 'Acme', status: 'active', dueDate: '2030-01-01' } })).json;
  assert.strictEqual(created.progress, 0);
  const t1 = (await call('POST', `/api/projects/${created.id}/tasks`, { cookie, body: { title: 'A', status: 'todo', priority: 'high', privateNotes: 'secret' } })).json;
  const t2 = (await call('POST', `/api/projects/${created.id}/tasks`, { cookie, body: { title: 'B', status: 'todo', priority: 'low' } })).json;
  await call('PATCH', `/api/tasks/${t2.id}`, { cookie, body: { status: 'todo', position: 0 } });
  let board = (await call('GET', `/api/projects/${created.id}`, { cookie })).json;
  assert.deepStrictEqual(board.tasks.map((t) => t.title), ['B', 'A']);
  await call('PATCH', `/api/tasks/${t1.id}`, { cookie, body: { status: 'done', clientUpdate: 'Finished!' } });
  board = (await call('GET', `/api/projects/${created.id}`, { cookie })).json;
  assert.strictEqual(board.project.progress, 50);
  assert.ok(board.tasks.find((t) => t.id === t1.id).clientUpdateAt);
  assert.strictEqual((await call('POST', `/api/projects/${created.id}/tasks`, { cookie, body: { title: '' } })).res.status, 400);
  assert.strictEqual((await call('PATCH', `/api/tasks/${t1.id}`, { cookie, body: { status: 'bogus' } })).res.status, 400);
  const client = await login(CLIENT_PW);
  assert.strictEqual((await call('GET', `/api/client/${created.shareToken}`, { cookie: client.cookie })).res.status, 200);
  await call('PATCH', `/api/projects/${created.id}`, { cookie, body: { archived: true } });
  assert.strictEqual((await call('GET', `/api/client/${created.shareToken}`, { cookie: client.cookie })).res.status, 404);
  assert.strictEqual((await call('DELETE', `/api/projects/${created.id}`, { cookie })).res.status, 200);
  assert.strictEqual((await call('GET', `/api/projects/${created.id}`, { cookie })).res.status, 404);
});

test('cross-origin writes are blocked', async () => {
  const { cookie } = await login(OWNER_PW);
  const res = await fetch(base + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(res.status, 403);
});

test('teardown', () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
