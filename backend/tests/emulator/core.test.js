import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, clearFirestore, newPotter, ADMIN, sha256 } from './helpers.js';
import { checkFirebase, createReadinessProbe } from '../../src/config/firebase.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';

let ctx;
before(() => {
  ctx = connect('core');
});
beforeEach(clearFirestore);
after(() => ctx.firebase.close());

test('connectivity probe reaches Firestore, Storage and Auth emulators', async () => {
  const result = await checkFirebase(ctx.firebase);
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, v.ok])),
    { firestore: true, storage: true, auth: true },
    JSON.stringify(result.checks),
  );
  assert.equal(result.ok, true);
});

test('connectivity probe reports a safe error code when a service is unreachable', async () => {
  const bad = { ...ctx.firebase, db: { collection: () => ({ doc: () => ({ get: () => Promise.reject(Object.assign(new Error('secret detail'), { code: 14 })) }) }) } };
  const result = await checkFirebase(bad);
  assert.equal(result.checks.firestore.ok, false);
  assert.match(result.checks.firestore.error, /UNAVAILABLE/);
  assert.ok(!JSON.stringify(result).includes('secret detail'));
});

test('GET /health/ready is 200 against the emulators', async () => {
  const app = createApp({ env: ctx.env, logger: createLogger(ctx.env), readiness: createReadinessProbe(ctx.firebase, { ttlMs: 0 }) });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/health/ready`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ready');
  await new Promise((resolve) => server.close(resolve));
});

test('timestamps are written by the server and serialised as ISO strings', async () => {
  const potter = await ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id });
  assert.match(potter.registrationDate, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(potter.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  // Raw documents hold real Firestore Timestamps, not strings.
  const raw = (await ctx.db.collection('potters').doc(potter.id).get()).data();
  assert.equal(typeof raw.registrationDate.toDate, 'function');
});

test('counters: concurrent registrations get unique, gap-free sequential IDs', async () => {
  const potters = await Promise.all(Array.from({ length: 10 }, () => ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id })));
  const ids = potters.map((p) => p.id).sort();
  assert.equal(new Set(ids).size, 10);
  assert.equal(ids[0], 'POT-1001');
  assert.equal(ids.at(-1), 'POT-1010');

  const devices = await Promise.all(Array.from({ length: 6 }, (_, i) => ctx.repos.devices.register({ credentialHash: sha256(`s${i}`) })));
  assert.deepEqual(
    devices.map((d) => d.id).sort(),
    Array.from({ length: 6 }, (_, i) => `DEV-${String(i + 1).padStart(3, '0')}`),
  );
});

test('potter validation errors are 400s that do not echo input', async () => {
  await assert.rejects(
    ctx.repos.potters.create(newPotter({ phone: 'not-a-phone' }), { createdBy: ADMIN.id }),
    (e) => e.status === 400 && e.details.some((d) => d.path === 'phone') && !JSON.stringify(e.details).includes('not-a-phone'),
  );
});

test('potters: update, status audit trail, list with cursor pagination', async () => {
  const created = [];
  for (let i = 0; i < 5; i++) created.push(await ctx.repos.potters.create(newPotter({ name: `Potter Number ${i}` }), { createdBy: ADMIN.id }));

  const updated = await ctx.repos.potters.update(created[0].id, { village: 'New Village', featured: true });
  assert.equal(updated.village, 'New Village');
  await assert.rejects(ctx.repos.potters.update('POT-9999', { village: 'x1' }), (e) => e.status === 404);

  await ctx.repos.potters.setStatus(created[1].id, 'inactive', ADMIN);
  const logs = (await ctx.db.collection('audit_logs').get()).docs.filter((d) => d.data().action !== 'potter.create');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data().action, 'potter.deactivate');

  const page1 = await ctx.repos.potters.list({ limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = await ctx.repos.potters.list({ limit: 2, cursor: page1.nextCursor });
  const page3 = await ctx.repos.potters.list({ limit: 2, cursor: page2.nextCursor });
  const all = [...page1.items, ...page2.items, ...page3.items].map((p) => p.id);
  assert.equal(new Set(all).size, 5);
  assert.equal(page3.nextCursor, null);

  assert.equal((await ctx.repos.potters.list({ status: 'inactive' })).items.length, 1);
  assert.equal((await ctx.repos.potters.list({ status: 'active', featured: true })).items.length, 1);
  await assert.rejects(ctx.repos.potters.list({ featured: true }), (e) => e.status === 400);
});
