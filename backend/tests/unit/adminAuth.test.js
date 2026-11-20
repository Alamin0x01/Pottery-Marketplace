import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticateUser } from '../../src/middleware/authUser.js';
import { requireRole } from '../../src/middleware/requireRole.js';
import { validate } from '../../src/middleware/validate.js';
import { dhakaDayRanges } from '../../src/utils/dhakaDays.js';
import { createDashboardService } from '../../src/services/dashboard.service.js';
import { toAdminOrder } from '../../src/utils/serializers.js';
import { ordersQuery, activityQuery, searchQuery, noQuery } from '../../src/validators/admin.validators.js';

const run = (middleware, req) => {
  const request = { get: (h) => req.headers?.[h.toLowerCase()], ...req };
  return new Promise((resolve) => middleware(request, {}, (err) => resolve({ err, req: request })));
};

const fakeAuth = (impl) => ({ verifyIdToken: async (token, revoked) => impl(token, revoked) });

test('authenticateUser: rejects missing, malformed and oversized Authorization headers with 401', async () => {
  const mw = authenticateUser({ auth: fakeAuth(() => ({ uid: 'u1' })) });
  for (const authorization of [undefined, '', 'Bearer', 'Basic abc', 'Bearer a b', `Bearer ${'x'.repeat(5000)}`]) {
    const { err } = await run(mw, { headers: { authorization } });
    assert.equal(err?.status, 401, String(authorization).slice(0, 20));
  }
});

test('authenticateUser: verifies with checkRevoked and takes the role only from the verified claim', async () => {
  let seenRevoked;
  const mw = authenticateUser({
    auth: fakeAuth((_t, revoked) => {
      seenRevoked = revoked;
      return { uid: 'u1', email: 'a@example.com', role: 'admin' };
    }),
  });
  // Hostile request attributes that claim a role must be ignored.
  const { err, req } = await run(mw, {
    headers: { authorization: 'Bearer good', 'x-role': 'superadmin' },
    body: { role: 'superadmin' },
    query: { role: 'superadmin' },
  });
  assert.equal(err, undefined);
  assert.equal(seenRevoked, true);
  assert.deepEqual(req.user, { uid: 'u1', email: 'a@example.com', role: 'admin', demo: false });
});

test('authenticateUser: unknown or invalid role claims become null (no privileges)', async () => {
  for (const role of ['root', 'ADMIN', 7, undefined, null, { $: 1 }]) {
    const mw = authenticateUser({ auth: fakeAuth(() => ({ uid: 'u1', role })) });
    const { req } = await run(mw, { headers: { authorization: 'Bearer t' } });
    assert.equal(req.user.role, null, String(role));
  }
});

test('authenticateUser: rejected tokens are 401, infrastructure failures are 503 (never a fake "invalid session")', async () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error', 'auth/user-disabled']) {
    const mw = authenticateUser({ auth: fakeAuth(() => Promise.reject(Object.assign(new Error('x'), { code }))) });
    assert.equal((await run(mw, { headers: { authorization: 'Bearer t' } })).err.status, 401, code);
  }
  const logged = [];
  const mw = authenticateUser({
    auth: fakeAuth(() => Promise.reject(Object.assign(new Error('socket hang up'), { code: 'auth/network-error' }))),
    logger: { error: (...a) => logged.push(a) },
  });
  const { err } = await run(mw, { headers: { authorization: 'Bearer t' } });
  assert.equal(err.status, 503);
  assert.equal(err.code, 'AUTH_UNAVAILABLE');
  assert.ok(!JSON.stringify(logged).includes('Bearer'), 'token must not be logged');
});

test('requireRole: 401 without identity, 403 without the role, passes with it', async () => {
  const mw = requireRole('admin', 'superadmin');
  assert.equal((await run(mw, {})).err.status, 401);
  assert.equal((await run(mw, { user: { role: null } })).err.status, 403);
  assert.equal((await run(mw, { user: { role: 'customer' } })).err.status, 403);
  assert.equal((await run(mw, { user: { role: 'admin' } })).err, undefined);
  assert.equal((await run(requireRole('superadmin'), { user: { role: 'admin' } })).err.status, 403);
});

test('validate: strict query schemas, coerced numbers, parsed values only via req.valid', async () => {
  const check = async (schema, query) => run(validate({ query: schema }), { query });
  assert.equal((await check(ordersQuery, { limit: '5', status: 'pending', needsAttention: 'true' })).req.valid.query.limit, 5);
  assert.equal((await check(ordersQuery, {})).req.valid.query.limit, 20);
  for (const bad of [{ limit: '0' }, { limit: 'abc' }, { limit: '101' }, { status: 'bogus' }, { potterId: 'x' }, { evil: '1' }, { limit: ['1', '2'] }]) {
    assert.equal((await check(ordersQuery, bad)).err?.status, 400, JSON.stringify(bad));
  }
  assert.equal((await check(activityQuery, { limit: '51' })).err?.status, 400);
  assert.equal((await check(searchQuery, { q: '   ' })).err?.status, 400);
  assert.equal((await check(searchQuery, {})).err?.status, 400);
  assert.equal((await check(noQuery, { x: '1' })).err?.status, 400);
});

test('Bangladesh day buckets: 14 consecutive local days, UTC+6, correct boundaries', () => {
  // 2026-11-19 19:30 UTC is already 2026-11-20 01:30 in Dhaka.
  const ranges = dhakaDayRanges(new Date('2026-11-19T19:30:00Z'), 14);
  assert.equal(ranges.length, 14);
  assert.equal(ranges.at(-1).date, '2026-11-20');
  assert.equal(ranges.at(-1).start.toISOString(), '2026-11-19T18:00:00.000Z');
  assert.equal(ranges.at(-1).end.toISOString(), '2026-11-20T18:00:00.000Z');
  assert.equal(ranges[0].date, '2026-11-07');
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].start.getTime(), ranges[i - 1].end.getTime());
});

test('dashboard service: derives totals from counts, caches briefly, never reports negative offline', async () => {
  let calls = 0;
  const raw = {
    potters: { active: 3, inactive: 1 },
    devices: { unassigned: 2, active: 4, disabled: 1, lost: 1 },
    onlineDevices: 5, // inconsistent on purpose (clock skew/race): must be clamped
    products: { draft: 2, pending_review: 3, approved: 5, rejected: 1, removed: 4, suspended: 0 },
    orders: { pending: 2, seller_notified: 1, contacted: 0, price_negotiation: 0, confirmed: 1, processing: 0, shipped: 0, delivered: 3, cancelled: 1 },
    needsAttention: 2,
    ordersByDay: [{ date: '2026-11-19', count: 3 }],
  };
  const service = createDashboardService({ stats: { dashboardCounts: async () => (calls++, raw) }, onlineWindowSec: 900, ttlMs: 60_000 });
  const a = await service.getSummary();
  assert.equal(a.counts.potters.total, 4);
  assert.equal(a.counts.devices.total, 8);
  assert.equal(a.counts.devices.online, 4);
  assert.equal(a.counts.devices.offline, 0);
  assert.equal(a.counts.products.total, 11); // excludes the 4 removed
  assert.equal(a.counts.products.pendingApproval, 3);
  assert.equal(a.counts.orders.total, 8);
  assert.equal(a.counts.orders.pending, 2);
  assert.equal(a.counts.orders.needsAttention, 2);
  await Promise.all([service.getSummary(), service.getSummary()]);
  assert.equal(calls, 1, 'cached');
  service.invalidate();
  await service.getSummary();
  assert.equal(calls, 2);
});

test('admin order view never exposes the tracking token hash or idempotency key', () => {
  const view = toAdminOrder({ id: 'ORD-1', trackingTokenHash: 'a'.repeat(64), idempotencyKey: 'k', buyerName: 'X', status: 'pending' });
  assert.deepEqual(view, { id: 'ORD-1', buyerName: 'X', status: 'pending' });
});
