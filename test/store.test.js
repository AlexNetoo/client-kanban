'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { Store } = require('../server/store');
const { ConflictError } = require('../server/persist');

/** In-memory stand-in for a shared store with ETag-conditional writes (like Vercel Blob). */
function fakeShared() {
  let text = null; let n = 0;
  return {
    shared: true,
    async load() { await new Promise((r) => setImmediate(r)); return text === null ? null : { text, version: `"v${n}"` }; },
    async save(next, version) {
      await new Promise((r) => setImmediate(r));
      if ((text === null) !== (version == null) || (version != null && version !== `"v${n}"`)) throw new ConflictError();
      text = next; n += 1; return `"v${n}"`;
    },
  };
}

test('two instances writing at once never lose an update (conflicts are retried)', async () => {
  const shared = fakeShared();
  const a = new Store(shared); const b = new Store(shared);
  await a.transact(() => {}); // seeds
  const runs = { a: 0, b: 0 };
  await Promise.all([...Array(8)].flatMap((_, i) => [
    a.transact(() => { runs.a += 1; a.createDesigner({ name: `A${i}`, role: '' }); }),
    b.transact(() => { runs.b += 1; b.createDesigner({ name: `B${i}`, role: '' }); }),
  ]));
  const c = new Store(shared);
  const names = await c.transact(() => c.listDesigners().map((d) => d.name));
  for (let i = 0; i < 8; i += 1) assert.ok(names.includes(`A${i}`) && names.includes(`B${i}`), `lost update ${i}`);
  assert.ok(runs.a + runs.b > 16, 'expected at least one conflicting step to be retried');
});

test('a failed request leaves no partial changes behind', async () => {
  const shared = fakeShared();
  const a = new Store(shared);
  await a.transact(() => {});
  await assert.rejects(a.transact(() => { a.createDesigner({ name: 'Ghost', role: '' }); throw new Error('boom'); }), /boom/);
  const names = await a.transact(() => a.listDesigners().map((d) => d.name));
  assert.ok(!names.includes('Ghost'));
});

test('readers see another instance’s write immediately', async () => {
  const shared = fakeShared();
  const a = new Store(shared); const b = new Store(shared);
  await a.transact(() => a.createDesigner({ name: 'Fresh', role: '' }));
  assert.ok((await b.transact(() => b.listDesigners())).some((d) => d.name === 'Fresh'));
});

test('AI proposals: an update that names the task instead of giving its id still resolves', () => {
  const { sanitize } = require('../server/ai');
  const tasks = [{ id: 't1', title: 'Contact form', description: '', priority: 'medium', status: 'todo' }, { id: 't2', title: 'Dup', description: '' }, { id: 't3', title: 'dup', description: '' }];
  const out = sanitize({ reply: 'ok', actions: [
    { type: 'update_task', title: 'contact form', description: 'Fields for name, email and message', priority: 'high' },
    { type: 'update_task', title: 'Dup', description: 'ambiguous, dropped' },
    { type: 'update_task', title: 'Unknown task', description: 'dropped' },
  ] }, { tasks, designers: [] });
  assert.strictEqual(out.actions.length, 1);
  assert.deepStrictEqual(out.actions[0], { type: 'update_task', taskId: 't1', taskTitle: 'Contact form', fields: { description: 'Fields for name, email and message', priority: 'high' } });
});
