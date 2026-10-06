'use strict';
const { test: rawTest } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server/index');
const { hashPassword } = require('../server/auth');

const OWNER_PW = 'owner-test-password';
let server, base, dir;

const ready = (async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-'));
  ({ server } = createApp({
    ownerHash: hashPassword(OWNER_PW), secret: 'x'.repeat(40),
    sessionMs: 3600_000, dataFile: path.join(dir, 'db.json'), secureCookies: false, trustProxy: false, seedDemo: true,
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
async function login(password, email, as) {
  const { res, json } = await call('POST', '/api/login', { body: email ? { email, password, ...(as ? { as } : {}) } : { password } });
  return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

let clientSeq = 0;
/** A real client account (admin-created) with its own login, assigned to the given projects. */
async function newClient(ownerCookie, projectIds = []) {
  clientSeq += 1;
  const email = `client${clientSeq}@example.com`; const password = `client-pass-${clientSeq}-xyz`;
  const r = await call('POST', '/api/clients', { cookie: ownerCookie, body: { name: `Client ${clientSeq}`, company: 'TestCo', email, password, projectIds } });
  assert.strictEqual(r.res.status, 201, r.text);
  const l = await login(password, email, 'client');
  assert.strictEqual(l.status, 200);
  return { id: r.json.id, email, password, cookie: l.cookie };
}
const assignClient = (ownerCookie, clientId, projectIds) => call('PATCH', `/api/clients/${clientId}`, { cookie: ownerCookie, body: { projectIds } });

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
  assert.strictEqual((await call('GET', '/designer')).res.status, 200); // the designer sign-in page is public too
});

test('/demo and the boot script are public, but grant no access to real data', async () => {
  for (const p of ['/demo', '/demo/']) {
    const r = await call('GET', p);
    assert.strictEqual(r.res.status, 200, p);
    assert.ok(r.text.includes('id="root"') && r.text.includes('id="intro"'));
  }
  const boot = await call('GET', '/boot.js');
  assert.strictEqual(boot.res.status, 200);
  assert.ok(/sessionStorage/.test(boot.text));
  assert.strictEqual((await call('GET', '/api/projects')).res.status, 401); // the demo page does not open the API
  assert.strictEqual((await call('GET', '/api/session')).res.status, 401);
  assert.strictEqual((await call('GET', '/')).res.status, 302); // the real app still needs a session
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

test('client sessions see assigned projects read-only and never receive private notes', async () => {
  const owner = await login(OWNER_PW);
  const { json: projects } = await call('GET', '/api/projects', { cookie: owner.cookie });
  const client = await newClient(owner.cookie, [projects[0].id]);
  const mineList = await call('GET', '/api/projects', { cookie: client.cookie });
  assert.deepStrictEqual(mineList.json.map((p) => p.id), [projects[0].id]); // only the assigned project
  assert.ok(!mineList.text.includes('shareToken'));
  const board = await call('GET', `/api/projects/${projects[0].id}`, { cookie: client.cookie });
  assert.strictEqual(board.res.status, 200);
  assert.ok(board.json.tasks.length > 0 && board.json.tasks.every((x) => !('privateNotes' in x)));
  assert.strictEqual((await call('GET', `/api/projects/${projects[1].id}`, { cookie: client.cookie })).res.status, 404);
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
  const client = await newClient(cookie, [created.id]);
  assert.strictEqual((await call('GET', `/api/client/${created.shareToken}`, { cookie: client.cookie })).res.status, 200);
  await call('PATCH', `/api/projects/${created.id}`, { cookie, body: { archived: true } });
  assert.strictEqual((await call('GET', `/api/client/${created.shareToken}`, { cookie: client.cookie })).res.status, 404);
  assert.strictEqual((await call('DELETE', `/api/projects/${created.id}`, { cookie })).res.status, 200);
  assert.strictEqual((await call('GET', `/api/projects/${created.id}`, { cookie })).res.status, 404);
});

test('designers, assignment and comments are owner-only and never reach clients', async () => {
  const { cookie } = await login(OWNER_PW);
  const client = await newClient(cookie, []);
  const designers = (await call('GET', '/api/designers', { cookie })).json;
  assert.ok(designers.length >= 3);
  const namesForClient = await call('GET', '/api/designers', { cookie: client.cookie });
  assert.strictEqual(namesForClient.res.status, 200); // names only, so assignees can be shown
  assert.ok(namesForClient.json.every((d) => !('email' in d) && !('hasLogin' in d)));
  const projects = (await call('GET', '/api/projects', { cookie })).json;
  await assignClient(cookie, client.id, [projects[0].id]);
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
  assert.strictEqual(c.authorName, 'Admin'); // a spoofed authorId in the body is ignored
  assert.strictEqual((await call('POST', `/api/tasks/${task.id}/comments`, { cookie, body: { text: '' } })).res.status, 400);
  const clientSees = await call('GET', `/api/projects/${projects[0].id}`, { cookie: client.cookie });
  assert.ok(!clientSees.text.includes('SECRET-COMMENT-TEXT')); // the admin's comment is internal
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
  const client = await newClient(cookie, []);
  const p = (await call('POST', '/api/projects', { cookie, body: { name: 'Retainer', client: 'Acme', status: 'active', dueDate: '2030-05-05', recurring: true } })).json;
  assert.strictEqual(p.recurring, true);
  assert.strictEqual(p.dueDate, '');
  await assignClient(cookie, client.id, [p.id]);
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
  for (const [m, u, b] of [['POST', '/api/projects', {}], ['PATCH', `/api/projects/${pA.id}`, { name: 'x' }], ['DELETE', `/api/projects/${pA.id}`], ['DELETE', `/api/tasks/${mine.id}`], ['POST', '/api/designers', { name: 'x' }], ['PATCH', `/api/designers/${dee.json.id}`, { name: 'x' }], ['DELETE', `/api/designers/${dee.json.id}`], ['GET', `/api/client/${pA.shareToken}`]]) {
    assert.strictEqual((await call(m, u, { ...D, body: b })).res.status, 403, `${m} ${u}`);
  }
  // designers can add tasks to their own projects (assigned to them by default, no private notes or client updates), not elsewhere
  const made = await call('POST', `/api/projects/${pA.id}/tasks`, { ...D, body: { title: 'From Dee', status: 'todo', privateNotes: 'sneaky', clientUpdate: 'sneaky' } });
  assert.strictEqual(made.res.status, 201, made.text);
  assert.strictEqual(made.json.assigneeId, dee.json.id);
  assert.ok(!('privateNotes' in made.json) && made.json.clientUpdate === '');
  assert.strictEqual((await call('POST', `/api/projects/${pB.id}/tasks`, { ...D, body: { title: 'nope' } })).res.status, 404);
  assert.strictEqual((await call('GET', `/api/projects/${pA.id}`, O)).json.tasks.find((t) => t.id === made.json.id).privateNotes, '');
  const names = (await call('GET', '/api/designers', D)).json;
  assert.ok(names.length >= 3 && names.every((d) => !('email' in d) && !('hasLogin' in d)));

  // moves: own task only, and only status/position
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { status: 'in_review' } })).json.status, 'in_review');
  // designers edit working fields of any task in their projects, but never private notes or client updates
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { privateNotes: 'x' } })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { clientUpdate: 'x' } })).res.status, 403);
  const edited = await call('PATCH', `/api/tasks/${notMine.id}`, { ...D, body: { title: 'renamed', priority: 'high', dueDate: '2030-05-05', description: 'd' } });
  assert.strictEqual(edited.res.status, 200, edited.text);
  assert.deepStrictEqual([edited.json.title, edited.json.priority, edited.json.dueDate], ['renamed', 'high', '2030-05-05']);
  assert.strictEqual((await call('PATCH', `/api/tasks/${notMine.id}`, { ...D, body: { status: 'done' } })).res.status, 200);
  assert.strictEqual((await call('PATCH', `/api/tasks/${mine.id}`, { ...D, body: { title: '' } })).res.status, 400);
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

test('sign-in: designers and clients use email on their own tab; the admin password never works as an account', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const c = await newClient(owner.cookie, []);
  const d = (await call('POST', '/api/designers', { ...O, body: { name: 'Tab Test', email: 'tab@example.com', password: 'tab-password-123' } })).json;
  const post = async (body) => (await call('POST', '/api/login', { body })).res.status;
  assert.strictEqual(await post({ email: c.email, password: c.password, as: 'client' }), 200);
  assert.strictEqual(await post({ email: c.email, password: c.password, as: 'designer' }), 401); // a client can't use the Designer tab
  assert.strictEqual(await post({ email: 'tab@example.com', password: 'tab-password-123', as: 'designer' }), 200);
  assert.strictEqual(await post({ email: 'tab@example.com', password: 'tab-password-123', as: 'client' }), 401);
  assert.strictEqual(await post({ email: c.email, password: OWNER_PW, as: 'client' }), 401); // admin password is not an account password
  assert.strictEqual(await post({ password: c.password }), 401); // password alone is admin-only now
  assert.strictEqual(await post({ password: 'tab-password-123' }), 401);
  assert.strictEqual(await post({ password: OWNER_PW, as: 'designer' }), 400);
  await call('DELETE', `/api/designers/${d.id}`, O); await call('DELETE', `/api/clients/${c.id}`, O);
});

test('client accounts: scoped to assigned projects, admin-managed, revoked immediately', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const mk = async (name) => (await call('POST', '/api/projects', { ...O, body: { name, client: 'Acme', status: 'active' } })).json;
  const A = await mk('Acct A'); const B = await mk('Acct B');
  const c = await newClient(owner.cookie, [A.id]); const C = { cookie: c.cookie };

  // only assigned projects, with the token needed to open them
  const mine = (await call('GET', '/api/projects', C)).json;
  assert.deepStrictEqual(mine.map((p) => p.name), ['Acct A']);
  assert.ok(!JSON.stringify(mine).includes('shareToken'));
  assert.strictEqual((await call('GET', `/api/client/${A.shareToken}`, C)).res.status, 200);
  assert.strictEqual((await call('GET', `/api/client/${B.shareToken}`, C)).res.status, 404); // exists, but not theirs
  for (const [m, u] of [['GET', '/api/clients'], ['GET', '/api/task-search?q=a']]) {
    assert.strictEqual((await call(m, u, C)).res.status, 403, `${m} ${u}`);
  }
  assert.strictEqual((await call('POST', '/api/projects', { ...C, body: { name: 'x', client: 'y' } })).res.status, 403);
  assert.strictEqual((await call('POST', '/api/clients', { ...C, body: { name: 'x', email: 'x@example.com', password: 'xxxxxxxxxxxx' } })).res.status, 403);

  // the admin changes access: assign another project, archive, delete
  await assignClient(owner.cookie, c.id, [A.id, B.id]);
  assert.strictEqual((await call('GET', '/api/projects', C)).json.length, 2);
  assert.strictEqual((await call('GET', `/api/client/${B.shareToken}`, C)).res.status, 200);
  await call('PATCH', `/api/projects/${B.id}`, { ...O, body: { archived: true } });
  assert.strictEqual((await call('GET', '/api/projects', C)).json.length, 1);
  await call('DELETE', `/api/projects/${B.id}`, O);
  assert.deepStrictEqual((await call('GET', '/api/clients', O)).json.find((x) => x.id === c.id).projectIds, [A.id]);
  assert.strictEqual((await assignClient(owner.cookie, c.id, ['no-such-project'])).res.status, 400);

  // validation and uniqueness (across designers AND clients)
  assert.strictEqual((await call('POST', '/api/clients', { ...O, body: { name: 'Dup', email: c.email.toUpperCase(), password: 'dup-password-123' } })).res.status, 409);
  assert.strictEqual((await call('POST', '/api/designers', { ...O, body: { name: 'Dup', email: c.email, password: 'dup-password-123' } })).res.status, 409);
  assert.strictEqual((await call('POST', '/api/clients', { ...O, body: { name: 'Short', email: 's@example.com', password: 'short' } })).res.status, 400);
  assert.strictEqual((await call('POST', '/api/clients', { ...O, body: { name: 'NoPw', email: 'n@example.com' } })).res.status, 400);
  assert.ok(!(await call('GET', '/api/clients', O)).text.includes('scrypt'));

  // a client changes their own password: wrong current rejected, fresh session issued, old one revoked
  assert.strictEqual((await call('POST', '/api/me/password', { ...C, body: { current: 'nope-nope-nope', next: 'a-new-client-pass-1' } })).res.status, 401);
  const chg = await fetch(`${base}/api/me/password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie }, body: JSON.stringify({ current: c.password, next: 'a-new-client-pass-1' }) });
  assert.strictEqual(chg.status, 200);
  const fresh = { cookie: chg.headers.get('set-cookie').split(';')[0] };
  assert.strictEqual((await call('GET', '/api/projects', fresh)).res.status, 200);
  assert.strictEqual((await call('GET', '/api/projects', C)).res.status, 401);

  // admin reset signs the client out at once; the old password stops working; removing the login or the account does too
  assert.strictEqual((await call('PATCH', `/api/clients/${c.id}`, { ...O, body: { password: 'admin-reset-pass-9' } })).res.status, 200);
  assert.strictEqual((await call('GET', '/api/projects', fresh)).res.status, 401);
  assert.strictEqual((await login('a-new-client-pass-1', c.email, 'client')).status, 401);
  const again = await login('admin-reset-pass-9', c.email, 'client');
  assert.strictEqual(again.status, 200);
  assert.strictEqual((await call('DELETE', `/api/clients/${c.id}`, O)).res.status, 200);
  assert.strictEqual((await call('GET', '/api/projects', { cookie: again.cookie })).res.status, 401);
  assert.strictEqual((await login('admin-reset-pass-9', c.email, 'client')).status, 401);
  await call('DELETE', `/api/projects/${A.id}`, O);
});

test('task links: shown on both tasks, validated, scoped for designers, hidden from clients, cleaned up on delete', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const mkProject = async (name) => (await call('POST', '/api/projects', { ...O, body: { name, client: 'LinkCo', status: 'active' } })).json;
  const mkTask = async (p, title) => (await call('POST', `/api/projects/${p.id}/tasks`, { ...O, body: { title, status: 'todo', priority: 'low' } })).json;
  const P1 = await mkProject('Links P1'); const P2 = await mkProject('Links P2');
  const a = await mkTask(P1, 'Alpha task'); const b = await mkTask(P1, 'Beta task'); const x = await mkTask(P2, 'Xray hidden task');
  const tasksOf = async (p, cookie = owner.cookie) => (await call('GET', `/api/projects/${p.id}`, { cookie })).json.tasks;
  const link = (id, body, cookie = owner.cookie) => call('POST', `/api/tasks/${id}/links`, { cookie, body });

  // create + both directions with inverse wording
  const created = await link(a.id, { targetId: b.id, type: 'blocks' });
  assert.strictEqual(created.res.status, 201);
  assert.deepStrictEqual(created.json.links.map((l) => [l.label, l.task.id]), [['blocks', b.id]]);
  const bLinks = (await tasksOf(P1)).find((t) => t.id === b.id).links;
  assert.deepStrictEqual(bLinks.map((l) => [l.label, l.task.id, l.task.title]), [['is blocked by', a.id, 'Alpha task']]);

  // validation
  assert.strictEqual((await link(a.id, { targetId: a.id, type: 'relates' })).res.status, 400);
  assert.strictEqual((await link(a.id, { targetId: 'nope', type: 'relates' })).res.status, 404);
  assert.strictEqual((await link(a.id, { targetId: b.id, type: 'whatever' })).res.status, 400);
  assert.strictEqual((await link(b.id, { targetId: a.id, type: 'relates' })).res.status, 409); // already linked, either direction
  assert.strictEqual((await link(a.id, { targetId: x.id, type: 'relates' })).res.status, 201); // across projects

  // inverse direction: "Beta is duplicated by Gamma" is stored as Gamma duplicates Beta
  const g = await mkTask(P1, 'Gamma task');
  const inv = await link(b.id, { targetId: g.id, type: 'duplicates', inverse: true });
  assert.deepStrictEqual(inv.json.links.map((l) => l.label).sort(), ['is blocked by', 'is duplicated by']);
  assert.deepStrictEqual((await tasksOf(P1)).find((t) => t.id === g.id).links.map((l) => [l.label, l.task.id]), [['duplicates', b.id]]);

  // search
  const found = (await call('GET', '/api/task-search?q=xray', O)).json;
  assert.ok(found.some((r) => r.id === x.id && r.projectName === 'Links P2'));
  assert.ok(!(await call('GET', `/api/task-search?q=alpha&exclude=${a.id}`, O)).json.some((r) => r.id === a.id));

  // clients never see links
  const client = await newClient(owner.cookie, [P1.id]);
  const view = await call('GET', `/api/client/${P1.shareToken}`, { cookie: client.cookie });
  assert.ok(view.json.tasks.every((t) => !('links' in t)) && !view.text.includes('Beta task\",\"links'));
  assert.strictEqual((await link(a.id, { targetId: b.id, type: 'relates' }, client.cookie)).res.status, 403);

  // designers: see only links into projects they can access; cannot edit or search
  const lee = (await call('POST', '/api/designers', { ...O, body: { name: 'Lee', email: 'lee@example.com', password: 'lee-password-123' } })).json;
  await call('PATCH', `/api/tasks/${a.id}`, { ...O, body: { assigneeId: lee.id } });
  const dl = await login('lee-password-123', 'lee@example.com'); const D = { cookie: dl.cookie };
  const dA = (await tasksOf(P1, dl.cookie)).find((t) => t.id === a.id);
  assert.deepStrictEqual(dA.links.map((l) => l.task.id), [b.id]); // x lives in P2, which Lee can't open
  assert.ok(!JSON.stringify(dA.links).includes('Xray'));
  assert.strictEqual((await link(a.id, { targetId: b.id, type: 'relates' }, dl.cookie)).res.status, 403);
  assert.strictEqual((await call('DELETE', `/api/tasks/${a.id}/links/${created.json.links[0].id}`, D)).res.status, 403);
  assert.strictEqual((await call('GET', '/api/task-search?q=a', D)).res.status, 403);

  // removing a link updates both sides; deleting a task drops its links
  assert.strictEqual((await call('DELETE', `/api/tasks/${a.id}/links/${created.json.links[0].id}`, O)).res.status, 200);
  assert.ok(!(await tasksOf(P1)).find((t) => t.id === b.id).links.some((l) => l.task.id === a.id)); // gone from the other side too
  await link(a.id, { targetId: b.id, type: 'duplicates' });
  await call('DELETE', `/api/tasks/${b.id}`, O);
  assert.ok(!(await tasksOf(P1)).find((t) => t.id === a.id).links.some((l) => l.task.id === b.id));
  await call('DELETE', `/api/projects/${P2.id}`, O); // cascades: a's link to x disappears
  assert.deepStrictEqual((await tasksOf(P1)).find((t) => t.id === a.id).links, []);
  await call('DELETE', `/api/projects/${P1.id}`, O); await call('DELETE', `/api/designers/${lee.id}`, O);
});

test('attachments: upload, download, limits, permissions, cleanup', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const client = await newClient(owner.cookie, []);
  const P = (await call('POST', '/api/projects', { ...O, body: { name: 'Files P', client: 'FileCo', status: 'active' } })).json;
  await assignClient(owner.cookie, client.id, [P.id]);
  const Q = (await call('POST', '/api/projects', { ...O, body: { name: 'Files Q', client: 'FileCo', status: 'active' } })).json;
  const task = (await call('POST', `/api/projects/${P.id}/tasks`, { ...O, body: { title: 'Has files', status: 'todo', priority: 'low' } })).json;
  const other = (await call('POST', `/api/projects/${P.id}/tasks`, { ...O, body: { title: 'Someone else', status: 'todo', priority: 'low' } })).json;
  const qTask = (await call('POST', `/api/projects/${Q.id}/tasks`, { ...O, body: { title: 'Elsewhere', status: 'todo', priority: 'low' } })).json;
  const tasksOf = async (id, cookie = owner.cookie) => (await call('GET', `/api/projects/${id}`, { cookie })).json.tasks;
  const put = (url, bytes, cookie) => fetch(base + url, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' }, body: bytes });
  const req = (taskId, body, cookie = owner.cookie) => call('POST', `/api/tasks/${taskId}/attachments`, { cookie, body });
  const done = (taskId, attId, cookie = owner.cookie) => call('POST', `/api/tasks/${taskId}/attachments/${attId}/complete`, { cookie, body: {} });
  const file = Buffer.from('hello world');

  // happy path: request -> upload -> complete; pending uploads stay invisible; storage details never leak
  const r = await req(task.id, { name: 'brief.pdf', size: file.length, type: 'application/pdf' });
  assert.strictEqual(r.res.status, 201);
  assert.strictEqual(r.json.upload.method, 'PUT');
  assert.strictEqual((await tasksOf(P.id)).find((x) => x.id === task.id).attachments.length, 0);
  assert.strictEqual((await done(task.id, r.json.attachmentId)).res.status, 409); // nothing uploaded yet
  assert.strictEqual((await put(r.json.upload.url, file, owner.cookie)).status, 200);
  const completed = await done(task.id, r.json.attachmentId);
  assert.strictEqual(completed.res.status, 200);
  assert.deepStrictEqual(completed.json.attachments.map((a) => [a.name, a.size, a.uploadedByName]), [['brief.pdf', 11, 'Admin']]);
  assert.ok(!completed.text.includes('pathname') && !completed.text.includes('"status":"ready"'));
  assert.ok(fs.existsSync(path.join(dir, 'uploads', r.json.attachmentId)));

  // download: exact bytes, forced attachment, no sniffing
  const dl = await fetch(`${base}/api/attachments/${r.json.attachmentId}/file`, { headers: { Cookie: owner.cookie } });
  assert.strictEqual(dl.status, 200);
  assert.strictEqual(Buffer.from(await dl.arrayBuffer()).toString(), 'hello world');
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''brief\.pdf$/);
  assert.strictEqual(dl.headers.get('x-content-type-options'), 'nosniff');

  // validation
  assert.strictEqual((await req(task.id, { name: 'big.zip', size: 26 * 1024 * 1024, type: 'application/zip' })).res.status, 413);
  assert.strictEqual((await req(task.id, { name: 'virus.EXE', size: 10, type: 'application/x-msdownload' })).res.status, 400);
  assert.strictEqual((await req(task.id, { name: 'empty.txt', size: 0, type: 'text/plain' })).res.status, 400);
  const sneaky = await req(task.id, { name: '../../etc/passwd.txt', size: 3, type: 'text/plain' });
  const sneakyAtt = (await put(sneaky.json.upload.url, Buffer.from('abc'), owner.cookie), await done(task.id, sneaky.json.attachmentId)).json.attachments.find((a) => a.id === sneaky.json.attachmentId);
  assert.ok(!/[\\/]/.test(sneakyAtt.name), `path characters must be stripped, got ${sneakyAtt.name}`);
  // a body bigger than declared is refused and leaves nothing behind
  const liar = await req(task.id, { name: 'liar.txt', size: 5, type: 'text/plain' });
  assert.strictEqual((await put(liar.json.upload.url, Buffer.alloc(500), owner.cookie)).status, 413);
  assert.strictEqual((await done(task.id, liar.json.attachmentId)).res.status, 409);
  assert.ok(!fs.existsSync(path.join(dir, 'uploads', liar.json.attachmentId)) && !fs.existsSync(path.join(dir, 'uploads', `${liar.json.attachmentId}.part`)));

  // permissions
  assert.strictEqual((await call('GET', `/api/attachments/${r.json.attachmentId}/file`, {})).res.status, 401);
  assert.strictEqual((await req(task.id, { name: 'x.txt', size: 1, type: 'text/plain' }, client.cookie)).res.status, 403);
  assert.strictEqual((await call('GET', `/api/attachments/${r.json.attachmentId}/file`, { cookie: client.cookie })).res.status, 404); // internal: doesn't exist for clients
  const kim = (await call('POST', '/api/designers', { ...O, body: { name: 'Kim', email: 'kim@example.com', password: 'kim-password-123' } })).json;
  await call('PATCH', `/api/tasks/${task.id}`, { ...O, body: { assigneeId: kim.id } });
  const kl = await login('kim-password-123', 'kim@example.com'); const K = { cookie: kl.cookie };
  assert.strictEqual((await req(other.id, { name: 'x.txt', size: 1, type: 'text/plain' }, kl.cookie)).res.status, 403); // not assigned to Kim
  assert.strictEqual((await req(qTask.id, { name: 'x.txt', size: 1, type: 'text/plain' }, kl.cookie)).res.status, 404); // project Kim can't open
  assert.strictEqual((await fetch(`${base}/api/attachments/${r.json.attachmentId}/file`, { headers: K.cookie ? { Cookie: kl.cookie } : {} })).status, 200); // can read files in her project
  const mine = await req(task.id, { name: 'comp.png', size: 4, type: 'image/png' }, kl.cookie);
  assert.strictEqual(mine.res.status, 201);
  await put(mine.json.upload.url, Buffer.from('png!'), kl.cookie);
  const mineDone = await done(task.id, mine.json.attachmentId, kl.cookie);
  assert.deepStrictEqual(mineDone.json.attachments.find((a) => a.name === 'comp.png').uploadedByName, 'Kim');
  assert.strictEqual((await call('DELETE', `/api/tasks/${task.id}/attachments/${r.json.attachmentId}`, K)).res.status, 403); // not hers
  assert.strictEqual((await put(`/api/uploads/${r.json.attachmentId}`, file, kl.cookie)).status, 404); // already complete
  // the old summary view carries no attachments either
  const view = await call('GET', `/api/client/${P.shareToken}`, { cookie: client.cookie });
  assert.ok(view.json.tasks.every((t) => !('attachments' in t)) && !view.text.includes('brief.pdf'));

  // delete: designers their own, owner any; files leave the disk
  assert.strictEqual((await call('DELETE', `/api/tasks/${task.id}/attachments/${mine.json.attachmentId}`, K)).res.status, 200);
  assert.ok(!fs.existsSync(path.join(dir, 'uploads', mine.json.attachmentId)));
  assert.strictEqual((await call('DELETE', `/api/tasks/${task.id}/attachments/${sneaky.json.attachmentId}`, O)).res.status, 200);
  assert.strictEqual((await fetch(`${base}/api/attachments/${sneaky.json.attachmentId}/file`, { headers: { Cookie: owner.cookie } })).status, 404);
  // deleting the task (and project) removes remaining files
  assert.strictEqual((await call('DELETE', `/api/tasks/${task.id}`, O)).res.status, 200);
  assert.ok(!fs.existsSync(path.join(dir, 'uploads', r.json.attachmentId)));
  const again = await req(other.id, { name: 'again.txt', size: 2, type: 'text/plain' });
  await put(again.json.upload.url, Buffer.from('ok'), owner.cookie); await done(other.id, again.json.attachmentId);
  assert.ok(fs.existsSync(path.join(dir, 'uploads', again.json.attachmentId)));
  await call('DELETE', `/api/projects/${P.id}`, O);
  assert.ok(!fs.existsSync(path.join(dir, 'uploads', again.json.attachmentId)));
  await call('DELETE', `/api/projects/${Q.id}`, O); await call('DELETE', `/api/designers/${kim.id}`, O);
});

test('cross-origin writes are blocked', async () => {
  const { cookie } = await login(OWNER_PW);
  const res = await fetch(base + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{}' });
  assert.strictEqual(res.status, 403);
});

test('clients: read-only board, shared comments only, no private notes or attachments', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const mkP = async (name) => (await call('POST', '/api/projects', { ...O, body: { name, client: 'RO Co', status: 'active' } })).json;
  const P = await mkP('RO Board'); const Q = await mkP('RO Hidden');
  const T = (await call('POST', `/api/projects/${P.id}/tasks`, { ...O, body: { title: 'Visible task', description: 'Shown to all', status: 'in_progress', priority: 'high', privateNotes: 'PRIVATE-NOTE-XYZ', clientUpdate: 'Update for the client' } })).json;
  const QT = (await call('POST', `/api/projects/${Q.id}/tasks`, { ...O, body: { title: 'Hidden task', status: 'todo', priority: 'low' } })).json;
  const des = (await call('POST', '/api/designers', { ...O, body: { name: 'Ro Des', email: 'rodes@example.com', password: 'rodes-password-123' } })).json;
  await call('PATCH', `/api/tasks/${T.id}`, { ...O, body: { assigneeId: des.id } });
  const D = { cookie: (await login('rodes-password-123', 'rodes@example.com', 'designer')).cookie };
  const c = await newClient(owner.cookie, [P.id]); const C = { cookie: c.cookie };
  const comment = (cookie, body, id = T.id) => call('POST', `/api/tasks/${id}/comments`, { cookie, body });
  const clientTask = async () => (await call('GET', `/api/projects/${P.id}`, C)).json.tasks.find((x) => x.id === T.id);

  // admin and designer comments are internal unless explicitly shared
  await comment(owner.cookie, { text: 'INTERNAL-ADMIN' });
  await comment(owner.cookie, { text: 'SHARED-ADMIN', shared: true });
  await comment(D.cookie, { text: 'INTERNAL-DESIGNER' });
  await comment(D.cookie, { text: 'SHARED-DESIGNER', shared: true });
  let seen = await clientTask();
  assert.deepStrictEqual(seen.comments.map((x) => x.text), ['SHARED-ADMIN', 'SHARED-DESIGNER']);
  assert.ok(seen.comments.every((x) => x.visibility === 'client'));
  const teamView = (await tasksOf2(O.cookie)).comments.map((x) => [x.text, x.visibility]);
  assert.deepStrictEqual(teamView, [['INTERNAL-ADMIN', 'internal'], ['SHARED-ADMIN', 'client'], ['INTERNAL-DESIGNER', 'internal'], ['SHARED-DESIGNER', 'client']]);
  async function tasksOf2(cookie) { return (await call('GET', `/api/projects/${P.id}`, { cookie })).json.tasks.find((x) => x.id === T.id); }

  // what a client does and doesn't get on the task
  assert.strictEqual(seen.privateNotes, undefined);
  assert.ok(!JSON.stringify(seen).includes('PRIVATE-NOTE-XYZ'));
  assert.deepStrictEqual([seen.title, seen.description, seen.clientUpdate, seen.priority, seen.status], ['Visible task', 'Shown to all', 'Update for the client', 'high', 'in_progress']);
  assert.strictEqual((await call('GET', `/api/projects/${Q.id}`, C)).res.status, 404);
  assert.strictEqual((await comment(C.cookie, { text: 'nope' }, QT.id)).res.status, 404);

  // attachments are hidden from clients and can't be fetched
  const up = await call('POST', `/api/tasks/${T.id}/attachments`, { ...O, body: { name: 'secret.pdf', size: 3, type: 'application/pdf' } });
  await fetch(base + up.json.upload.url, { method: 'PUT', headers: { Cookie: owner.cookie, 'Content-Type': 'application/octet-stream' }, body: Buffer.from('abc') });
  await call('POST', `/api/tasks/${T.id}/attachments/${up.json.attachmentId}/complete`, { ...O, body: {} });
  assert.strictEqual((await tasksOf2(O.cookie)).attachments.length, 1);
  seen = await clientTask();
  assert.deepStrictEqual(seen.attachments, []);
  assert.strictEqual((await fetch(`${base}/api/attachments/${up.json.attachmentId}/file`, { headers: { Cookie: c.cookie } })).status, 404);

  // links: only to projects the client can open
  await call('POST', `/api/tasks/${T.id}/links`, { ...O, body: { targetId: QT.id, type: 'relates' } });
  assert.strictEqual((await tasksOf2(O.cookie)).links.length, 1);
  assert.deepStrictEqual((await clientTask()).links, []);

  // a client can comment (always shared, whatever they send); the team sees it, authored by their account
  const mine = await comment(C.cookie, { text: 'Question from the client', shared: false, authorId: 'owner' });
  assert.strictEqual(mine.res.status, 201);
  const mc = mine.json.comments.find((x) => x.text === 'Question from the client');
  assert.deepStrictEqual([mc.authorName, mc.authorRole, mc.visibility, mc.authorId], [c.email && 'Client ' + clientSeq, 'client', 'client', c.id]);
  assert.ok((await tasksOf2(D.cookie)).comments.some((x) => x.text === 'Question from the client' && x.authorRole === 'client'));
  assert.ok((await tasksOf2(O.cookie)).comments.some((x) => x.text === 'Question from the client'));
  assert.strictEqual((await comment(C.cookie, { text: '' })).res.status, 400);

  // everything else is read-only
  const adminCommentId = (await tasksOf2(O.cookie)).comments.find((x) => x.text === 'SHARED-ADMIN').id;
  const internalId = (await tasksOf2(O.cookie)).comments.find((x) => x.text === 'INTERNAL-ADMIN').id;
  for (const [m, u, b] of [['PATCH', `/api/tasks/${T.id}`, { status: 'done' }], ['POST', `/api/projects/${P.id}/tasks`, { title: 'x' }], ['DELETE', `/api/tasks/${T.id}`], ['POST', `/api/tasks/${T.id}/links`, { targetId: QT.id, type: 'relates' }],
    ['POST', `/api/tasks/${T.id}/attachments`, { name: 'a.txt', size: 1, type: 'text/plain' }], ['PATCH', `/api/projects/${P.id}`, { name: 'x' }], ['DELETE', `/api/projects/${P.id}`], ['GET', '/api/task-search?q=a'], ['GET', '/api/clients']]) {
    assert.strictEqual((await call(m, u, { ...C, body: b })).res.status, 403, `${m} ${u}`);
  }
  assert.strictEqual((await call('DELETE', `/api/tasks/${T.id}/comments/${adminCommentId}`, C)).res.status, 403); // someone else's
  assert.strictEqual((await call('DELETE', `/api/tasks/${T.id}/comments/${internalId}`, C)).res.status, 403); // internal, not theirs
  assert.strictEqual((await call('DELETE', `/api/tasks/${T.id}/comments/${mc.id}`, C)).res.status, 200); // their own
  assert.ok(!(await clientTask()).comments.some((x) => x.id === mc.id));
  assert.strictEqual((await tasksOf2(O.cookie)).comments.length, 4);

  await call('DELETE', `/api/projects/${P.id}`, O); await call('DELETE', `/api/projects/${Q.id}`, O);
  await call('DELETE', `/api/designers/${des.id}`, O); await call('DELETE', `/api/clients/${c.id}`, O);
});

test('attachments can be shared with clients, file by file', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const mk = async (name) => (await call('POST', '/api/projects', { ...O, body: { name, client: 'Share Co', status: 'active' } })).json;
  const P = await mk('Share P'); const Q = await mk('Share Q');
  const T = (await call('POST', `/api/projects/${P.id}/tasks`, { ...O, body: { title: 'Has shared files', status: 'todo', priority: 'low' } })).json;
  const QT = (await call('POST', `/api/projects/${Q.id}/tasks`, { ...O, body: { title: 'Other project', status: 'todo', priority: 'low' } })).json;
  const des = (await call('POST', '/api/designers', { ...O, body: { name: 'Share Des', email: 'sharedes@example.com', password: 'sharedes-pass-123' } })).json;
  await call('PATCH', `/api/tasks/${T.id}`, { ...O, body: { assigneeId: des.id } });
  const D = { cookie: (await login('sharedes-pass-123', 'sharedes@example.com', 'designer')).cookie };
  const c = await newClient(owner.cookie, [P.id]); const C = { cookie: c.cookie };
  const attach = async (cookie, taskId, name, content, shared) => {
    const r = await call('POST', `/api/tasks/${taskId}/attachments`, { cookie, body: { name, size: content.length, type: 'text/plain', ...(shared === undefined ? {} : { shared }) } });
    assert.strictEqual(r.res.status, 201, r.text);
    await fetch(base + r.json.upload.url, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(content) });
    const done = await call('POST', `/api/tasks/${taskId}/attachments/${r.json.attachmentId}/complete`, { cookie, body: {} });
    assert.strictEqual(done.res.status, 200, done.text);
    return { id: r.json.attachmentId, task: done.json };
  };
  const clientFiles = async () => (await call('GET', `/api/projects/${P.id}`, C)).json.tasks.find((x) => x.id === T.id).attachments;
  const file = (cookie, id) => fetch(`${base}/api/attachments/${id}/file`, { headers: { Cookie: cookie } });

  // default is internal: clients can't list or fetch it
  const internal = await attach(owner.cookie, T.id, 'internal.txt', 'team only');
  assert.strictEqual(internal.task.attachments.find((a) => a.id === internal.id).visibility, 'internal');
  assert.deepStrictEqual(await clientFiles(), []);
  assert.strictEqual((await file(C.cookie, internal.id)).status, 404);

  // shared at upload time: visible and downloadable by the client, byte for byte
  const shared = await attach(owner.cookie, T.id, 'deliverable.txt', 'for the client', true);
  assert.deepStrictEqual((await clientFiles()).map((a) => [a.name, a.visibility]), [['deliverable.txt', 'client']]);
  const dl = await file(C.cookie, shared.id);
  assert.strictEqual(dl.status, 200);
  assert.strictEqual(await dl.text(), 'for the client');
  assert.match(dl.headers.get('content-disposition'), /^attachment/);
  assert.strictEqual((await file(C.cookie, internal.id)).status, 404); // still hidden

  // clients can't change anything about files
  for (const [m, u, b] of [['PATCH', `/api/tasks/${T.id}/attachments/${internal.id}`, { shared: true }], ['DELETE', `/api/tasks/${T.id}/attachments/${shared.id}`], ['POST', `/api/tasks/${T.id}/attachments`, { name: 'x.txt', size: 1, type: 'text/plain' }]]) {
    assert.strictEqual((await call(m, u, { ...C, body: b })).res.status, 403, `${m} ${u}`);
  }

  // toggling: share an internal file, then take it back
  const on = await call('PATCH', `/api/tasks/${T.id}/attachments/${internal.id}`, { ...O, body: { shared: true } });
  assert.strictEqual(on.res.status, 200);
  assert.strictEqual((await clientFiles()).length, 2);
  assert.strictEqual((await file(C.cookie, internal.id)).status, 200);
  await call('PATCH', `/api/tasks/${T.id}/attachments/${internal.id}`, { ...O, body: { shared: false } });
  assert.strictEqual((await clientFiles()).length, 1);
  assert.strictEqual((await file(C.cookie, internal.id)).status, 404);
  assert.strictEqual((await call('PATCH', `/api/tasks/${T.id}/attachments/${internal.id}`, { ...O, body: { shared: 'yes' } })).res.status, 400);

  // designers can share only what they uploaded
  const mine = await attach(D.cookie, T.id, 'design.txt', 'by the designer');
  assert.strictEqual((await call('PATCH', `/api/tasks/${T.id}/attachments/${mine.id}`, { ...D, body: { shared: true } })).res.status, 200);
  assert.ok((await clientFiles()).some((a) => a.name === 'design.txt'));
  assert.strictEqual((await call('PATCH', `/api/tasks/${T.id}/attachments/${internal.id}`, { ...D, body: { shared: true } })).res.status, 403);
  assert.strictEqual((await call('PATCH', `/api/tasks/${T.id}/attachments/${shared.id}`, { ...D, body: { shared: false } })).res.status, 403);

  // a client can't reach shared files in projects that aren't theirs
  const other = await attach(owner.cookie, QT.id, 'other.txt', 'not yours', true);
  assert.strictEqual((await file(C.cookie, other.id)).status, 404);
  assert.strictEqual((await call('GET', `/api/projects/${Q.id}`, C)).res.status, 404);

  // unassigning the client's project removes access to its shared files
  await assignClient(owner.cookie, c.id, []);
  assert.strictEqual((await file(C.cookie, shared.id)).status, 404);

  for (const id of [P.id, Q.id]) await call('DELETE', `/api/projects/${id}`, O);
  await call('DELETE', `/api/designers/${des.id}`, O); await call('DELETE', `/api/clients/${c.id}`, O);
});

test('only the admin can create, edit or delete projects (not designers, clients or anonymous visitors)', async () => {
  const owner = await login(OWNER_PW); const O = { cookie: owner.cookie };
  const des = (await call('POST', '/api/designers', { ...O, body: { name: 'No Projects', email: 'noproj@example.com', password: 'noproj-pass-123' } })).json;
  const D = { cookie: (await login('noproj-pass-123', 'noproj@example.com', 'designer')).cookie };
  const own = (await call('POST', '/api/projects', { ...O, body: { name: 'Admin made', client: 'Acme', status: 'active' } })).json;
  assert.strictEqual(own.name, 'Admin made'); // the admin can
  await call('PATCH', `/api/tasks/${(await call('POST', `/api/projects/${own.id}/tasks`, { ...O, body: { title: 't', status: 'todo', priority: 'low' } })).json.id}`, { ...O, body: { assigneeId: des.id } });
  const c = await newClient(owner.cookie, [own.id]);
  const body = { name: 'Sneaky project', client: 'x', status: 'active' };
  for (const [who, cookie, expected] of [['designer', D.cookie, 403], ['client', c.cookie, 403], ['anonymous', undefined, 401]]) {
    assert.strictEqual((await call('POST', '/api/projects', { cookie, body })).res.status, expected, `${who} create`);
    assert.strictEqual((await call('PATCH', `/api/projects/${own.id}`, { cookie, body: { name: 'hacked' } })).res.status, expected, `${who} edit`);
    assert.strictEqual((await call('DELETE', `/api/projects/${own.id}`, { cookie })).res.status, expected, `${who} delete`);
  }
  const names = (await call('GET', '/api/projects', O)).json.map((p) => p.name);
  assert.ok(!names.includes('Sneaky project') && names.includes('Admin made')); // nothing leaked in, nothing was changed
  await call('DELETE', `/api/projects/${own.id}`, O); await call('DELETE', `/api/designers/${des.id}`, O); await call('DELETE', `/api/clients/${c.id}`, O);
});

test('changing the admin password signs out every existing admin session', async () => {
  const owner = await login(OWNER_PW);
  assert.strictEqual((await call('GET', '/api/projects', { cookie: owner.cookie })).res.status, 200);
  // the same deployment after the admin password was changed (same session secret, new hash)
  const { server: server2 } = createApp({ ownerHash: hashPassword('a-brand-new-admin-pw'), secret: 'x'.repeat(40), sessionMs: 3600_000, dataFile: path.join(dir, 'db2.json'), secureCookies: false, trustProxy: false });
  await new Promise((r) => server2.listen(0, r));
  try {
    const res = await fetch(`http://localhost:${server2.address().port}/api/projects`, { headers: { Cookie: owner.cookie } });
    assert.strictEqual(res.status, 401); // the old admin cookie no longer works
    const page = await fetch(`http://localhost:${server2.address().port}/admin`, { headers: { Cookie: owner.cookie }, redirect: 'manual' });
    assert.ok((await page.text()).includes('<div id="root">') && page.status === 200); // /admin falls back to the sign-in page
    const fresh = await fetch(`http://localhost:${server2.address().port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'a-brand-new-admin-pw' }) });
    assert.strictEqual(fresh.status, 200);
  } finally { server2.close(); }
});

test('a fresh install starts empty; sample data only appears when SEED_DEMO_DATA is on, and never refills an emptied database', async () => {
  const boot = async (extra, file) => {
    const { server } = createApp({ ownerHash: hashPassword(OWNER_PW), secret: 'x'.repeat(40), sessionMs: 3600_000, dataFile: file, secureCookies: false, trustProxy: false, ...extra });
    await new Promise((r) => server.listen(0, r));
    const url = `http://localhost:${server.address().port}`;
    const login = await fetch(`${url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: OWNER_PW }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (p) => (await fetch(url + p, { headers: { Cookie: cookie } })).json();
    return { server, url, cookie, get };
  };
  const emptyFile = path.join(dir, 'fresh-empty.json');
  const a = await boot({}, emptyFile);
  try {
    assert.deepStrictEqual(await a.get('/api/projects'), []);
    assert.deepStrictEqual(await a.get('/api/designers'), []);
    assert.deepStrictEqual(await a.get('/api/clients'), []);
  } finally { a.server.close(); }
  const demoFile = path.join(dir, 'fresh-demo.json');
  const b = await boot({ seedDemo: true }, demoFile);
  try {
    assert.ok((await b.get('/api/projects')).length >= 3 && (await b.get('/api/designers')).length >= 3);
    // delete everything, then restart WITH the flag still on: the (now empty) database must not be refilled
    for (const p of await b.get('/api/projects')) await fetch(`${b.url}/api/projects/${p.id}`, { method: 'DELETE', headers: { Cookie: b.cookie } });
    for (const d of await b.get('/api/designers')) await fetch(`${b.url}/api/designers/${d.id}`, { method: 'DELETE', headers: { Cookie: b.cookie } });
  } finally { b.server.close(); }
  const c = await boot({ seedDemo: true }, demoFile);
  try {
    assert.deepStrictEqual(await c.get('/api/projects'), []);
    assert.deepStrictEqual(await c.get('/api/designers'), []);
  } finally { c.server.close(); }
});

test('client onboarding: server prices the brief, the admin approves it into a project', async () => {
  const owner = (await login(OWNER_PW)).cookie;
  const c = await newClient(owner);
  const brief = { name: 'New site', type: 'Website design & development', description: 'A marketing site', goals: ['More leads', ' ', 'Faster pages'], references: '', notes: '', startDate: '2030-01-01', dueDate: '2030-02-04' };
  // 35 days = 1 month (4500) + 5 days (1250 > a week) -> 1 month + 1 week = 5700
  const r = await call('POST', '/api/requests', { cookie: c.cookie, body: { ...brief, estimate: { total: 1 } } });
  assert.strictEqual(r.res.status, 201, r.text);
  assert.strictEqual(r.json.days, 35);
  assert.strictEqual(r.json.estimate.total, 5700);
  assert.deepStrictEqual(r.json.goals, ['More leads', 'Faster pages']);
  const day = async (due) => (await call('POST', '/api/requests', { cookie: c.cookie, body: { ...brief, dueDate: due } })).json.estimate;
  assert.strictEqual((await day('2030-01-01')).total, 250); // 1 day
  assert.strictEqual((await day('2030-01-05')).total, 1200); // 5 days cost a week, not 1250
  assert.strictEqual((await day('2030-01-28')).total, 4500); // 4 weeks would be 4800: a month is cheaper
  assert.strictEqual((await day('2030-01-31')).total, 4750); // 31 days: 1 month + 1 day
  assert.strictEqual((await day('2030-12-31')).total, 50000); // 365 days = one year
  assert.strictEqual((await day('2030-12-01')).total, 50000); // 335 days would be 11 months + 5 days > a year
  assert.strictEqual((await day('2030-06-29')).total, 27000); // 180 days = 6 months
  assert.deepStrictEqual((await day('2031-12-31')).lines.map((l) => [l.unit, l.qty]), [['year', 2]]); // 730 days
  // validation and access
  for (const bad of [{ goals: [] }, { name: '' }, { dueDate: '2029-12-31' }, { dueDate: '2033-01-01' }, { type: 'Marketing & campaign' }]) {
    assert.strictEqual((await call('POST', '/api/requests', { cookie: c.cookie, body: { ...brief, ...bad } })).res.status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await call('POST', '/api/requests', { cookie: owner, body: brief })).res.status, 403);
  const other = await newClient(owner);
  assert.strictEqual((await call('GET', '/api/requests', { cookie: other.cookie })).json.length, 0); // clients only see their own
  assert.ok((await call('GET', '/api/requests', { cookie: c.cookie })).json.length >= 1);
  assert.strictEqual((await call('POST', `/api/requests/${r.json.id}/accept`, { cookie: c.cookie, body: {} })).res.status, 403);
  // approving creates an active project, one task per goal, and gives the client access
  const ok = await call('POST', `/api/requests/${r.json.id}/accept`, { cookie: owner, body: {} });
  assert.strictEqual(ok.res.status, 200, ok.text);
  assert.strictEqual(ok.json.status, 'accepted');
  const mine = (await call('GET', '/api/projects', { cookie: c.cookie })).json.find((p) => p.id === ok.json.projectId);
  assert.ok(mine && mine.status === 'active' && mine.total === 2);
  assert.strictEqual((await call('POST', `/api/requests/${r.json.id}/accept`, { cookie: owner, body: {} })).res.status, 409);
  assert.strictEqual((await call('DELETE', `/api/requests/${r.json.id}`, { cookie: owner })).res.status, 200);
});

test('admin can assign projects to a designer directly', async () => {
  const owner = (await login(OWNER_PW)).cookie;
  const proj = (await call('POST', '/api/projects', { cookie: owner, body: { name: 'Assigned P', client: 'Acme' } })).json;
  const email = 'assign-designer@example.com'; const pw = 'designer-pass-123456';
  const d = await call('POST', '/api/designers', { cookie: owner, body: { name: 'Dee', role: 'UI', email, password: pw } });
  assert.strictEqual(d.res.status, 201, d.text);
  const dc = (await login(pw, email, 'designer')).cookie;
  assert.ok(!(await call('GET', '/api/projects', { cookie: dc })).json.some((p) => p.id === proj.id));
  assert.strictEqual((await call('PATCH', `/api/designers/${d.json.id}`, { cookie: owner, body: { projectIds: ['nope'] } })).res.status, 400);
  const up = await call('PATCH', `/api/designers/${d.json.id}`, { cookie: owner, body: { projectIds: [proj.id] } });
  assert.deepStrictEqual(up.json.projectIds, [proj.id]);
  assert.ok((await call('GET', '/api/projects', { cookie: dc })).json.some((p) => p.id === proj.id)); // same session, no re-login needed
  assert.strictEqual((await call('PATCH', `/api/designers/${d.json.id}`, { cookie: dc, body: { projectIds: [] } })).res.status, 403);
  await call('DELETE', `/api/projects/${proj.id}`, { cookie: owner });
  assert.deepStrictEqual((await call('GET', '/api/designers', { cookie: owner })).json.find((x) => x.id === d.json.id).projectIds, []);
});

test('admin sign-in locks out after 5 wrong passwords, even for the right one', async () => {
  const bad = async () => (await call('POST', '/api/login', { body: { password: 'definitely-wrong-1' } })).res.status;
  for (let i = 0; i < 5; i += 1) assert.strictEqual(await bad(), 401);
  assert.strictEqual(await bad(), 429);
  assert.strictEqual((await call('POST', '/api/login', { body: { password: OWNER_PW } })).res.status, 429); // locked
  // designers/clients are not affected by the admin lockout (their limiter is separate)
  assert.strictEqual((await call('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'wrong-wrong-wrong' } })).res.status, 401);
});

test('teardown', () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
