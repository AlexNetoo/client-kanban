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
async function login(password, email) {
  const { res, json } = await call('POST', '/api/login', { body: email ? { email, password } : { password } });
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
  assert.strictEqual((await call('GET', '/index.html')).res.status, 302);
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

test('designers, assignment and comments are owner-only and never reach clients', async () => {
  const { cookie } = await login(OWNER_PW);
  const client = await login(CLIENT_PW);
  const designers = (await call('GET', '/api/designers', { cookie })).json;
  assert.ok(designers.length >= 3);
  assert.strictEqual((await call('GET', '/api/designers', { cookie: client.cookie })).res.status, 403);
  const projects = (await call('GET', '/api/projects', { cookie })).json;
  const board = (await call('GET', `/api/projects/${projects[0].id}`, { cookie })).json;
  const task = board.tasks[0];
  // assign, reject unknown designer
  const upd = await call('PATCH', `/api/tasks/${task.id}`, { cookie, body: { assigneeId: designers[0].id } });
  assert.strictEqual(upd.json.assigneeId, designers[0].id);
  assert.strictEqual((await call('PATCH', `/api/tasks/${task.id}`, { cookie, body: { assigneeId: 'nope' } })).res.status, 400);
  // comments
  const added = await call('POST', `/api/tasks/${task.id}/comments`, { cookie, body: { text: 'SECRET-COMMENT-TEXT', authorId: designers[1].id } });
  assert.strictEqual(added.res.status, 201);
  const c = added.json.comments.at(-1);
  assert.strictEqual(c.authorName, 'Freelancer'); // a spoofed authorId in the body is ignored
  assert.strictEqual((await call('POST', `/api/tasks/${task.id}/comments`, { cookie, body: { text: '' } })).res.status, 400);
  assert.strictEqual((await call('POST', `/api/tasks/${task.id}/comments`, { cookie: client.cookie, body: { text: 'x' } })).res.status, 403);
  const view = await call('GET', `/api/client/${projects[0].shareToken}`, { cookie: client.cookie });
  assert.ok(!view.text.includes('SECRET-COMMENT-TEXT'));
  assert.ok(view.json.tasks.every((x) => !('comments' in x) && !('assigneeId' in x) && !('privateNotes' in x)));
  // delete comment; deleting a designer unassigns their tasks but keeps comment author names
  assert.strictEqual((await call('DELETE', `/api/tasks/${task.id}/comments/${c.id}`, { cookie })).json.comments.some((x) => x.id === c.id), false);
  const fresh = (await call('POST', '/api/designers', { cookie, body: { name: 'Temp Person', role: 'x' } })).json;
  await call('PATCH', `/api/tasks/${task.id}`, { cookie, body: { assigneeId: fresh.id } });
  assert.strictEqual((await call('DELETE', `/api/designers/${fresh.id}`, { cookie })).res.status, 200);
  const after = (await call('GET', `/api/projects/${projects[0].id}`, { cookie })).json.tasks.find((x) => x.id === task.id);
  assert.strictEqual(after.assigneeId, '');
});

test('recurring projects have no due date and show as recurring to clients', async () => {
  const { cookie } = await login(OWNER_PW);
  const client = await login(CLIENT_PW);
  const p = (await call('POST', '/api/projects', { cookie, body: { name: 'Retainer', client: 'Acme', status: 'active', dueDate: '2030-05-05', recurring: true } })).json;
  assert.strictEqual(p.recurring, true);
  assert.strictEqual(p.dueDate, '');
  const view = await call('GET', `/api/client/${p.shareToken}`, { cookie: client.cookie });
  assert.strictEqual(view.json.project.recurring, true);
  const back = (await call('PATCH', `/api/projects/${p.id}`, { cookie, body: { recurring: false, dueDate: '2031-01-01' } })).json;
  assert.deepStrictEqual([back.recurring, back.dueDate], [false, '2031-01-01']);
  await call('DELETE', `/api/projects/${p.id}`, { cookie });
});

test('designer logins: scoped access, forced authorship, immediate revocation', async () => {
  const owner = await login(OWNER_PW);
  const O = { cookie: owner.cookie };
  const projects = (await call('GET', '/api/projects', O)).json;
  const [pA, pB] = projects;
  const tasksA = (await call('GET', `/api/projects/${pA.id}`, O)).json.tasks;
  const tasksB = (await call('GET', `/api/projects/${pB.id}`, O)).json.tasks;
  const mine = tasksA[0]; const notMine = tasksA[1]; const otherProject = tasksB[0];

  // owner creates a designer with a login; validation
  assert.strictEqual((await call('POST', '/api/designers', { ...O, body: { name: 'Dee', email: 'dee@example.com', password: 'short' } })).res.status, 400);
  assert.strictEqual((await call('POST', '/api/designers', { ...O, body: { name: 'Dee', email: 'not-an-email', password: 'long-enough-pass' } })).res.status, 400);
  assert.strictEqual((await call('POST', '/api/designers', { ...O, body: { name: 'Dee', email: 'dee@example.com' } })).res.status, 400);
  const dee = await call('POST', '/api/designers', { ...O, body: { name: 'Dee', role: 'UI', email: 'Dee@Example.com', password: 'dee-password-123' } });
  assert.strictEqual(dee.res.status, 201);
  assert.strictEqual(dee.json.email, 'dee@example.com');
  assert.ok(!dee.text.includes('passwordHash') && !dee.text.includes('scrypt'));
  assert.strictEqual((await call('POST', '/api/designers', { ...O, body: { name: 'Dup', email: 'DEE@example.com', password: 'another-pass-123' } })).res.status, 409);
  await call('PATCH', `/api/tasks/${mine.id}`, { ...O, body: { assigneeId: dee.json.id } });

  // sign-in: generic failures, owner password is not a designer password
  assert.strictEqual((await call('POST', '/api/login', { body: { email: 'dee@example.com', password: 'wrong-password-1' } })).res.status, 401);
  assert.strictEqual((await call('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'wrong-password-1' } })).res.status, 401);
  assert.strictEqual((await call('POST', '/api/login', { body: { email: 'dee@example.com', password: OWNER_PW } })).res.status, 401);
  const dl = await login('dee-password-123', 'dee@example.com');
  assert.strictEqual(dl.status, 200);
  assert.strictEqual(dl.json.role, 'designer');
  const D = { cookie: dl.cookie };
  assert.strictEqual((await call('GET', '/api/session', D)).json.designer.name, 'Dee');

  // sees only projects where assigned; no private notes or share links
  const dProjects = (await call('GET', '/api/projects', D)).json;
  assert.deepStrictEqual(dProjects.map((p) => p.id), [pA.id]);
  assert.ok(dProjects.every((p) => !('shareToken' in p)));
  assert.strictEqual((await call('GET', `/api/projects/${pB.id}`, D)).res.status, 404);
  const dBoard = await call('GET', `/api/projects/${pA.id}`, D);
  assert.ok(dBoard.json.tasks.every((t) => !('privateNotes' in t)));
  assert.ok(!('shareToken' in dBoard.json.project));

  // no owner powers
  for (const [m, u, b] of [['POST', '/api/projects', {}], ['PATCH', `/api/projects/${pA.id}`, { name: 'x' }], ['DELETE', `/api/projects/${pA.id}`], ['POST', `/api/projects/${pA.id}/tasks`, { title: 'x' }], ['DELETE', `/api/tasks/${mine.id}`], ['POST', '/api/designers', { name: 'x' }], ['PATCH', `/api/designers/${dee.json.id}`, { name: 'x' }], ['DELETE', `/api/designers/${dee.json.id}`], ['GET', `/api/client/${pA.shareToken}`]]) {
    assert.strictEqual((await call(m, u, { ...D, body: b })).res.status, 403, `${m} ${u}`);
  }
  const names = (await call('GET', '/api/designers', D)).json;
  assert.ok(names.length >= 3 && names.every((d) => !('email' in d) && !('hasLogin' in d)));

  // moves: own task only, and only status/position
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { status: 'in_review' } })).json.status, 'in_review');
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { title: 'renamed' } })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { assigneeId: '' } })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/tasks/${notMine.id}`, { ...D, body: { status: 'done' } })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/tasks/${otherProject.id}`, { ...D, body: { status: 'done' } })).res.status, 404);

  // comments: author is forced to the signed-in designer; can delete only own
  const posted = await call('POST', `/api/tasks/${mine.id}/comments`, { ...D, body: { text: 'From Dee', authorId: 'owner' } });
  assert.strictEqual(posted.res.status, 201);
  const mineC = posted.json.comments.at(-1);
  assert.deepStrictEqual([mineC.authorName, mineC.authorId], ['Dee', dee.json.id]);
  assert.ok(!('privateNotes' in posted.json));
  const ownerC = (await call('POST', `/api/tasks/${mine.id}/comments`, { ...O, body: { text: 'From owner' } })).json.comments.at(-1);
  assert.strictEqual((await call('DELETE', `/api/tasks/${mine.id}/comments/${ownerC.id}`, D)).res.status, 403);
  assert.strictEqual((await call('DELETE', `/api/tasks/${mine.id}/comments/${mineC.id}`, D)).res.status, 200);
  assert.strictEqual((await call('POST', `/api/tasks/${otherProject.id}/comments`, { ...D, body: { text: 'nope' } })).res.status, 404);

  // self-service password change: wrong current rejected, short rejected, success keeps this session and revokes nothing else needed
  assert.strictEqual((await call('POST', '/api/me/password', { ...D, body: { current: 'nope-nope-nope', next: 'a-much-better-pass-1' } })).res.status, 401);
  assert.strictEqual((await call('POST', '/api/me/password', { ...D, body: { current: 'dee-password-123', next: 'short' } })).res.status, 400);
  assert.strictEqual((await call('POST', '/api/me/password', O.cookie ? { ...O, body: { current: OWNER_PW, next: 'a-much-better-pass-1' } } : {})).res.status, 403);
  const chg = await fetch(base + '/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: dl.cookie }, body: JSON.stringify({ current: 'dee-password-123', next: 'dee-changed-pass-789' }) });
  assert.strictEqual(chg.status, 200);
  const newCookie = chg.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await call('GET', '/api/projects', { cookie: newCookie })).res.status, 200); // fresh session works
  assert.strictEqual((await call('GET', '/api/projects', D)).res.status, 401); // old cookie is revoked
  assert.strictEqual((await login('dee-changed-pass-789', 'dee@example.com')).status, 200);
  // owner can drop a login without deleting the person
  assert.strictEqual((await call('PATCH', `/api/designers/${dee.json.id}`, { ...O, body: { removeLogin: true } })).json.hasLogin, false);
  assert.strictEqual((await call('GET', '/api/projects', { cookie: newCookie })).res.status, 401);
  assert.strictEqual((await call('PATCH', `/api/designers/${dee.json.id}`, { ...O, body: { email: 'dee@example.com', password: 'brand-new-pass-456' } })).json.hasLogin, true);
  const D2 = { cookie: (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dee@example.com', password: 'brand-new-pass-456' }) })).headers.get('set-cookie').split(';')[0] };
  // revocation: password reset kills the old session immediately; old password stops working
  assert.strictEqual((await call('PATCH', `/api/designers/${dee.json.id}`, { ...O, body: { password: 'owner-reset-pass-789' } })).res.status, 200);
  assert.strictEqual((await call('GET', '/api/projects', D2)).res.status, 401);
  assert.strictEqual((await login('brand-new-pass-456', 'dee@example.com')).status, 401);
  const dl2 = await login('owner-reset-pass-789', 'dee@example.com');
  assert.strictEqual(dl2.status, 200);
  // removing the designer revokes too
  assert.strictEqual((await call('DELETE', `/api/designers/${dee.json.id}`, O)).res.status, 200);
  assert.strictEqual((await call('GET', '/api/projects', { cookie: dl2.cookie })).res.status, 401);
  assert.strictEqual((await login('owner-reset-pass-789', 'dee@example.com')).status, 401);
  // restore the task we touched
  await call('PATCH', `/api/tasks/${mine.id}`, { ...O, body: { status: mine.status } });
});

test('sign-in tabs: a password only works on its own account type', async () => {
  const as = async (password, which) => (await call('POST', '/api/login', { body: { password, as: which } })).res.status;
  assert.strictEqual(await as(OWNER_PW, 'owner'), 200);
  assert.strictEqual(await as(CLIENT_PW, 'client'), 200);
  assert.strictEqual(await as(CLIENT_PW, 'owner'), 401);
  assert.strictEqual(await as(OWNER_PW, 'client'), 401);
});

test('cross-origin writes are blocked', async () => {
  const { cookie } = await login(OWNER_PW);
  const res = await fetch(base + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(res.status, 403);
});

test('teardown', () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
