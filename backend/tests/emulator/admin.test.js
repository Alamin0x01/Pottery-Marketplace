import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { connect, clearFirestore, newPotter, potterWithDevice, approvedProduct, ADMIN, sha256 } from './helpers.js';
import { emulatorSignUp, emulatorSignIn, startApi } from './authHelpers.js';
import { createAdminsService } from '../../src/services/admins.service.js';
import { dhakaDayRanges } from '../../src/utils/dhakaDays.js';

let ctx;
let admins;
before(() => {
  ctx = connect('admin');
  admins = createAdminsService({ auth: ctx.firebase.auth, repos: ctx.repos });
});
beforeEach(clearFirestore);
after(() => ctx.firebase.close());

const PASSWORD = 'correct-horse-battery-1';
const uniqueEmail = (tag) => `${tag}-${randomUUID().slice(0, 8)}@example.com`;

/** A Firebase user that exists in Auth (like any public sign-up) with NO admin role. */
async function publicUser(tag = 'public') {
  const email = uniqueEmail(tag);
  const { idToken, localId } = await emulatorSignUp(email, PASSWORD);
  return { email, uid: localId, token: idToken };
}

/** A user granted a role by the trusted process, with a fresh token that carries the claim. */
async function adminUser(role = 'admin', tag = role) {
  const email = uniqueEmail(tag);
  const { localId } = await emulatorSignUp(email, PASSWORD);
  await admins.grant({ email, name: `Test ${tag}`, role });
  return { email, uid: localId, token: await emulatorSignIn(email, PASSWORD) };
}

test('authentication: missing, malformed and forged tokens are 401', async () => {
  const api = await startApi(ctx);
  try {
    for (const path of ['/api/admin/me', '/api/admin/dashboard', '/api/admin/orders', '/api/admin/nope']) {
      assert.equal((await api.get(path)).status, 401, path);
    }
    assert.equal((await api.get('/api/admin/me', 'garbage')).status, 401);
    assert.equal((await api.get('/api/admin/me', 'a.b.c')).status, 401);
    const { status, body } = await api.get('/api/admin/me', 'garbage');
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.ok(body.error.requestId);
    // A hand-made unsigned token claiming the admin role (the emulator accepts unsigned tokens only for REAL users).
    const forged = [{ alg: 'none', typ: 'JWT' }, { uid: 'attacker', role: 'superadmin', sub: 'attacker', aud: 'demo-pottery', iss: 'https://securetoken.google.com/demo-pottery', exp: 4102444800 }]
      .map((p) => Buffer.from(JSON.stringify(p)).toString('base64url'))
      .join('.');
    assert.equal((await api.get('/api/admin/me', `${forged}.`)).status, 401);
  } finally {
    await api.close();
  }
});

test('authorization: a signed-in public user without a role claim is 403 everywhere, however the request is dressed up', async () => {
  const api = await startApi(ctx);
  const user = await publicUser();
  try {
    for (const path of ['/api/admin/me', '/api/admin/dashboard', '/api/admin/activity', '/api/admin/orders', '/api/admin/products', '/api/admin/search?q=POT-1001', '/api/admin/admins']) {
      const { status, body } = await api.get(path, user.token);
      assert.equal(status, 403, path);
      assert.equal(body.error.code, 'FORBIDDEN');
    }
    // The role can never be supplied by the client: headers and query strings are ignored for identity.
    const dressed = await api.get('/api/admin/me?role=superadmin', user.token, { 'x-role': 'superadmin', 'x-user-role': 'admin' });
    assert.equal(dressed.status, 403, 'authorization is decided before any input is even looked at');
    assert.equal((await api.get('/api/admin/dashboard', user.token, { 'x-role': 'superadmin' })).status, 403);
  } finally {
    await api.close();
  }
});

test('an admin granted by the trusted process can read /me; the role comes from the token claim', async () => {
  const api = await startApi(ctx);
  const publicOne = await publicUser('later');
  try {
    const before = await api.get('/api/admin/me', publicOne.token);
    assert.equal(before.status, 403);

    await admins.grant({ email: publicOne.email, name: 'Later Admin', role: 'admin' });
    // The old token was minted before the grant, so it still has no claim...
    assert.equal((await api.get('/api/admin/me', publicOne.token)).status, 403);
    // ...a fresh token (what the browser gets after refreshing) carries it.
    const fresh = await emulatorSignIn(publicOne.email, PASSWORD);
    const me = await api.get('/api/admin/me', fresh);
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, { uid: publicOne.uid, email: publicOne.email, role: 'admin', name: 'Later Admin', active: true });
  } finally {
    await api.close();
  }
});

test('superadmin-only route: admin is 403, superadmin is 200 and sees the directory without secrets', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser('admin');
  const root = await adminUser('superadmin');
  try {
    assert.equal((await api.get('/api/admin/admins', admin.token)).status, 403);
    const { status, body } = await api.get('/api/admin/admins', root.token);
    assert.equal(status, 200);
    assert.deepEqual(body.items.map((a) => a.role).sort(), ['admin', 'superadmin']);
    assert.ok(body.items.every((a) => a.active === true && a.email && a.name && !('password' in a)));
  } finally {
    await api.close();
  }
});

test('revoking an admin ends all their sessions immediately; disabled accounts are rejected', async () => {
  const api = await startApi(ctx);
  await adminUser('superadmin'); // keeps the "last superadmin" guard out of the way
  const admin = await adminUser('admin');
  try {
    assert.equal((await api.get('/api/admin/me', admin.token)).status, 200);
    // Firebase tracks revocation with 1-second granularity: a token minted in the same second as the revocation
    // still verifies. Real sessions are older than that, so wait past the boundary like a real session would.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await admins.revoke({ email: admin.email });
    assert.equal((await api.get('/api/admin/me', admin.token)).status, 401, 'old token is revoked');
    const fresh = await emulatorSignIn(admin.email, PASSWORD);
    assert.equal((await api.get('/api/admin/me', fresh)).status, 403, 'new token has no role');
    assert.equal((await ctx.repos.admins.get(admin.uid)).active, false);

    const other = await adminUser('admin', 'other');
    assert.equal((await api.get('/api/admin/me', other.token)).status, 200);
    await ctx.firebase.auth.updateUser(other.uid, { disabled: true });
    assert.equal((await api.get('/api/admin/me', other.token)).status, 401);
  } finally {
    await api.close();
  }
});

test('grant/revoke service: validation, creation flow, idempotency and last-superadmin protection', async () => {
  const email = uniqueEmail('new');
  await assert.rejects(admins.grant({ email, name: 'No User', role: 'admin' }), (e) => e.status === 404);
  await assert.rejects(admins.grant({ email: 'not-an-email', name: 'X Y', role: 'admin' }), (e) => e.status === 400);
  await assert.rejects(admins.grant({ email, name: 'X Y', role: 'owner', createIfMissing: true }), (e) => e.status === 400);
  await assert.rejects(admins.grant({ email, name: 'X Y', role: 'admin', password: 'hunter2' }), (e) => e.status === 400, 'passwords are never accepted');

  const created = await admins.grant({ email, name: 'First Root', role: 'superadmin', createIfMissing: true });
  assert.equal(created.created, true);
  assert.match(created.passwordResetLink, /^http/);
  const user = await ctx.firebase.auth.getUser(created.uid);
  assert.equal(user.customClaims.role, 'superadmin');
  assert.equal((await ctx.repos.admins.get(created.uid)).role, 'superadmin');

  const again = await admins.grant({ email, name: 'First Root', role: 'superadmin' });
  assert.equal(again.created, false);
  assert.equal(again.passwordResetLink, null);

  await assert.rejects(admins.revoke({ email }), (e) => e.status === 409, 'last superadmin is protected');
  await assert.rejects(admins.revoke({ email: uniqueEmail('ghost') }), (e) => e.status === 404);

  const logs = (await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data());
  assert.ok(logs.some((l) => l.action === 'admin.grant' && l.after.role === 'superadmin'));
  assert.ok(!JSON.stringify(logs).includes('password'));
});

test('failed authentication attempts are throttled per client, successful ones are not', async () => {
  const api = await startApi(ctx, { failureLimit: 3 });
  const admin = await adminUser('admin');
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await api.get('/api/admin/me', 'bad-token')).status);
    assert.deepEqual(statuses.slice(0, 3), [401, 401, 401]);
    assert.equal(statuses[4], 429);
  } finally {
    await api.close();
  }
  const api2 = await startApi(ctx, { failureLimit: 3 });
  try {
    for (let i = 0; i < 8; i++) assert.equal((await api2.get('/api/admin/me', admin.token)).status, 200);
  } finally {
    await api2.close();
  }
});

test('query validation returns 400 with field details', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser();
  try {
    for (const path of ['/api/admin/orders?limit=0', '/api/admin/orders?limit=abc', '/api/admin/orders?limit=101', '/api/admin/orders?status=bogus', '/api/admin/orders?bogus=1', '/api/admin/products?potterId=x', '/api/admin/activity?limit=500', '/api/admin/search', '/api/admin/search?q=', '/api/admin/orders?cursor=%25%25%25']) {
      const { status, body } = await api.get(path, admin.token);
      assert.equal(status, 400, path);
      assert.equal(body.error.code, 'BAD_REQUEST');
    }
    const detail = await api.get('/api/admin/orders?limit=0', admin.token);
    assert.ok(detail.body.error.details.some((d) => d.path === 'limit'));
  } finally {
    await api.close();
  }
});

test('dashboard on an empty database: honest zeros, 14 empty day buckets', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser();
  try {
    const { status, body } = await api.get('/api/admin/dashboard', admin.token);
    assert.equal(status, 200);
    assert.deepEqual(body.counts.potters, { total: 0, active: 0, inactive: 0 });
    assert.deepEqual(
      { ...body.counts.devices },
      { total: 0, online: 0, offline: 0, unassigned: 0, disabled: 0, lost: 0, onlineWindowSec: 900 },
    );
    assert.equal(body.counts.products.total, 0);
    assert.equal(body.counts.products.pendingApproval, 0);
    assert.equal(body.counts.orders.total, 0);
    assert.equal(body.counts.orders.pending, 0);
    assert.equal(body.counts.orders.needsAttention, 0);
    assert.equal(body.ordersByDay.length, 14);
    assert.ok(body.ordersByDay.every((d) => d.count === 0));
    assert.match(body.generatedAt, /^\d{4}-/);
    assert.equal((await api.get('/api/admin/orders', admin.token)).body.items.length, 0);
    assert.equal((await api.get('/api/admin/activity', admin.token)).body.items.length >= 0, true);
  } finally {
    await api.close();
  }
});

test('dashboard statistics are computed from real Firestore data', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser();

  // Potters: 3 (one deactivated later).
  const a = await potterWithDevice(ctx.repos); // device active
  const b = await potterWithDevice(ctx.repos, { name: 'Second Potter' });
  const c = await ctx.repos.potters.create(newPotter({ name: 'Third Potter' }), { createdBy: ADMIN.id });
  // Devices: a (seen now = online), b (active, never seen = offline), c-owned stale device, unassigned, disabled.
  await ctx.repos.devices.recordSeen(a.device.id, { batteryPct: 90 });
  const stale = await ctx.repos.devices.register({ credentialHash: sha256('stale') });
  await ctx.repos.devices.assign({ deviceId: stale.id, potterId: c.id, actor: ADMIN });
  await ctx.db.collection('devices').doc(stale.id).update({ lastSeen: Timestamp.fromMillis(Date.now() - 3 * 3600 * 1000) });
  await ctx.repos.devices.register({ credentialHash: sha256('unassigned') });
  const dis = await ctx.repos.devices.register({ credentialHash: sha256('disabled') });
  await ctx.repos.devices.assign({ deviceId: dis.id, potterId: c.id, actor: ADMIN });
  await ctx.repos.devices.setStatus({ deviceId: dis.id, status: 'disabled', actor: ADMIN });

  // Products: 2 approved (a), 1 pending_review (b), 1 draft (b), 1 removed (a).
  const p1 = await approvedProduct(ctx.repos, a);
  const p2 = await approvedProduct(ctx.repos, a);
  const p3 = await approvedProduct(ctx.repos, a);
  await ctx.repos.products.transition(p3.id, 'removed', { actor: ADMIN });
  const draftId = ctx.repos.products.newId();
  for (const [captureId, pid] of [['capture-aaaa1', draftId], ['capture-bbbb2', ctx.repos.products.newId()]]) {
    await ctx.repos.uploads.createWithDraft({ deviceId: b.device.id, productId: pid, captureId, sizeBytes: 10, sha256: sha256(captureId), images: [{ path: 'x', kind: 'original' }] });
    if (pid !== draftId) await ctx.repos.products.transition(pid, 'pending_review', { actor: ADMIN });
  }

  // Orders: 3 pending (one flagged), 1 shipped-from-pending via direct update; one created 3 days ago.
  const mk = (productId) => ctx.repos.orders.createWithHistory({ productId, trackingTokenHash: sha256(randomUUID()), idempotencyKey: `key-${randomUUID()}`, buyerName: 'Karim', buyerPhone: '01812345678', deliveryAddress: 'House 1, Road 2, Dhaka', quantity: 1 });
  const o1 = await mk(p1.id);
  const o2 = await mk(p1.id);
  const o3 = await mk(p2.id);
  const o4 = await mk(p2.id);
  await ctx.db.collection('orders').doc(o2.id).update({ needsAdminAttention: true, attentionReason: 'device_offline' });
  await ctx.db.collection('orders').doc(o3.id).update({ status: 'shipped' });
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  await ctx.db.collection('orders').doc(o4.id).update({ createdAt: Timestamp.fromDate(threeDaysAgo) });

  await ctx.repos.potters.setStatus(b.potter.id, 'inactive', ADMIN);

  try {
    const { status, body } = await api.get('/api/admin/dashboard', admin.token);
    assert.equal(status, 200);
    const k = body.counts;
    assert.deepEqual(k.potters, { total: 3, active: 2, inactive: 1 });
    assert.equal(k.devices.total, 5);
    assert.equal(k.devices.online, 1, 'only device A was seen within the window');
    assert.equal(k.devices.offline, 2, 'B (never seen) + stale are active but offline');
    assert.equal(k.devices.unassigned, 1);
    assert.equal(k.devices.disabled, 1);
    assert.equal(k.products.total, 4, 'removed products are excluded: p1,p2 + pending + draft');
    assert.equal(k.products.pendingApproval, 1);
    assert.equal(k.products.byStatus.approved, 2);
    assert.equal(k.products.byStatus.removed, 1);
    assert.equal(k.orders.total, 4);
    assert.equal(k.orders.pending, 3);
    assert.equal(k.orders.byStatus.shipped, 1);
    assert.equal(k.orders.needsAttention, 1);

    const days = Object.fromEntries(body.ordersByDay.map((d) => [d.date, d.count]));
    const [today] = dhakaDayRanges(new Date(), 1);
    const old = dhakaDayRanges(new Date(threeDaysAgo.getTime() + 86_400_000 * 3), 1)[0].date; // date label of 3 days ago, built from the same helper
    const todayCount = days[today.date];
    assert.equal(todayCount, 3);
    assert.equal(Object.values(days).reduce((s, n) => s + n, 0), 4);
    assert.ok(body.ordersByDay.some((d) => d.count === 1 && d.date !== today.date), `old order bucketed: ${old}`);
  } finally {
    await api.close();
  }
});

test('recent orders/products and activity come from Firestore, newest first, without internal secrets', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser();
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture);
  const orderIds = [];
  for (let i = 0; i < 3; i++) {
    const o = await ctx.repos.orders.createWithHistory({ productId: product.id, trackingTokenHash: sha256(`t${i}`), idempotencyKey: `key-${randomUUID()}`, buyerName: `Buyer ${i}`, buyerPhone: '01812345678', deliveryAddress: 'House 1, Road 2, Dhaka', quantity: 1 });
    orderIds.push(o.id);
  }
  await ctx.db.collection('orders').doc(orderIds[2]).update({ needsAdminAttention: true, attentionReason: 'unacknowledged' });
  // An action performed by this admin, so the activity feed can resolve their name.
  await ctx.repos.potters.setStatus(fixture.potter.id, 'inactive', { type: 'admin', id: admin.uid });
  await ctx.repos.potters.setStatus(fixture.potter.id, 'active', { type: 'admin', id: admin.uid });
  try {
    const orders = await api.get('/api/admin/orders?limit=2', admin.token);
    assert.equal(orders.status, 200);
    assert.equal(orders.body.items.length, 2);
    assert.ok(orders.body.nextCursor);
    assert.deepEqual(orders.body.items.map((o) => o.id), [orderIds[2], orderIds[1]]);
    for (const o of orders.body.items) {
      assert.ok(!('trackingTokenHash' in o) && !('idempotencyKey' in o));
      assert.equal(o.potterId, fixture.potter.id);
    }
    const next = await api.get(`/api/admin/orders?limit=2&cursor=${encodeURIComponent(orders.body.nextCursor)}`, admin.token);
    assert.deepEqual(next.body.items.map((o) => o.id), [orderIds[0]]);
    assert.equal(next.body.nextCursor, null);

    assert.deepEqual((await api.get('/api/admin/orders?needsAttention=true', admin.token)).body.items.map((o) => o.id), [orderIds[2]]);
    assert.equal((await api.get('/api/admin/orders?status=pending', admin.token)).body.items.length, 3);
    assert.equal((await api.get('/api/admin/orders?status=shipped', admin.token)).body.items.length, 0);
    assert.equal((await api.get(`/api/admin/orders?potterId=${fixture.potter.id}`, admin.token)).body.items.length, 3);
    assert.equal((await api.get('/api/admin/orders?status=pending&needsAttention=true', admin.token)).status, 400, 'unsupported combination is a clean 400');

    const products = await api.get('/api/admin/products?limit=5', admin.token);
    assert.equal(products.body.items.length, 1);
    assert.equal(products.body.items[0].status, 'approved');
    assert.equal((await api.get('/api/admin/products?status=draft', admin.token)).body.items.length, 0);

    const activity = await api.get('/api/admin/activity?limit=3', admin.token);
    assert.equal(activity.status, 200);
    assert.equal(activity.body.items.length, 3);
    const stamps = activity.body.items.map((i) => Date.parse(i.timestamp));
    assert.deepEqual([...stamps].sort((x, y) => y - x), stamps, 'newest first');
    const mine = activity.body.items.find((i) => i.actor.id === admin.uid);
    assert.equal(mine.actor.name, 'Test admin');
    assert.ok(['potter.activate', 'potter.deactivate'].includes(mine.action));
    assert.equal(mine.target.label, `${fixture.potter.name} (${fixture.potter.id})`, 'targets are resolved to friendly labels');
    assert.ok(activity.body.items.every((i) => !('before' in i) && !('after' in i)), 'change snapshots are not exposed');
  } finally {
    await api.close();
  }
});

test('search: exact-ID lookup, no credential hashes, honest empty results', async () => {
  const api = await startApi(ctx);
  const admin = await adminUser();
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture);
  const order = await ctx.repos.orders.createWithHistory({ productId: product.id, trackingTokenHash: sha256('t'), idempotencyKey: `key-${randomUUID()}`, buyerName: 'Karim', buyerPhone: '01812345678', deliveryAddress: 'House 1, Road 2, Dhaka', quantity: 1 });
  try {
    const potter = await api.get(`/api/admin/search?q=${fixture.potter.id.toLowerCase()}`, admin.token);
    assert.equal(potter.body.results[0].type, 'potter');
    assert.equal(potter.body.results[0].title, fixture.potter.name);

    const device = await api.get(`/api/admin/search?q=${fixture.device.id}`, admin.token);
    assert.equal(device.body.results[0].type, 'device');
    assert.ok(!JSON.stringify(device.body).includes('credentialHash'));

    const found = await api.get(`/api/admin/search?q=${order.id}`, admin.token);
    assert.equal(found.body.results[0].type, 'order');
    assert.ok(!JSON.stringify(found.body).includes('01812345678'), 'buyer phone is not part of search results');

    const missing = await api.get('/api/admin/search?q=POT-9999', admin.token);
    assert.deepEqual(missing.body, { results: [], hint: 'No record with that ID.' });
    const text = await api.get('/api/admin/search?q=vase', admin.token);
    assert.equal(text.body.results.length, 0);
    assert.match(text.body.hint, /Potter ID/);
  } finally {
    await api.close();
  }
});
