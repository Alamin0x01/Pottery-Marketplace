import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, clearFirestore, newPotter, potterWithDevice, approvedProduct, ADMIN, sha256 } from './helpers.js';

let ctx;
before(() => {
  ctx = connect('devices');
});
beforeEach(clearFirestore);
after(() => ctx.firebase.close());

test('device registration stores only a hash and never returns it', async () => {
  const hash = sha256('device-secret-material');
  const device = await ctx.repos.devices.register({ credentialHash: hash });
  assert.equal(device.id, 'DEV-001');
  assert.equal(device.status, 'unassigned');
  assert.equal(device.potterId, null);
  assert.ok(!('credentialHash' in device));
  assert.equal((await ctx.repos.devices.getForAuth(device.id)).credentialHash, hash);
  await assert.rejects(ctx.repos.devices.register({ credentialHash: 'plain-text-secret' }), (e) => e.status === 400);
});

test('one potter can own several devices; each device has exactly one owner', async () => {
  const potter = await ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id });
  const a = await ctx.repos.devices.register({ credentialHash: sha256('a') });
  const b = await ctx.repos.devices.register({ credentialHash: sha256('b') });
  await ctx.repos.devices.assign({ deviceId: a.id, potterId: potter.id, actor: ADMIN });
  await ctx.repos.devices.assign({ deviceId: b.id, potterId: potter.id, actor: ADMIN });
  const owned = await ctx.repos.devices.listByPotter(potter.id);
  assert.deepEqual(owned.map((d) => d.id).sort(), [a.id, b.id]);
  assert.ok(owned.every((d) => d.status === 'active' && d.potterId === potter.id && !('credentialHash' in d)));
  // Re-assigning to the same potter is idempotent.
  await ctx.repos.devices.assign({ deviceId: a.id, potterId: potter.id, actor: ADMIN });
});

test('assignment rules: unknown records, inactive potters and disabled devices are refused', async () => {
  const potter = await ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id });
  const device = await ctx.repos.devices.register({ credentialHash: sha256('x') });
  await assert.rejects(ctx.repos.devices.assign({ deviceId: 'DEV-999', potterId: potter.id, actor: ADMIN }), (e) => e.status === 404);
  await assert.rejects(ctx.repos.devices.assign({ deviceId: device.id, potterId: 'POT-9999', actor: ADMIN }), (e) => e.status === 404);
  await assert.rejects(ctx.repos.devices.assign({ deviceId: device.id, potterId: 'bogus', actor: ADMIN }), (e) => e.status === 400);

  await ctx.repos.potters.setStatus(potter.id, 'inactive', ADMIN);
  await assert.rejects(ctx.repos.devices.assign({ deviceId: device.id, potterId: potter.id, actor: ADMIN }), (e) => e.status === 409);
  await ctx.repos.potters.setStatus(potter.id, 'active', ADMIN);

  await ctx.repos.devices.assign({ deviceId: device.id, potterId: potter.id, actor: ADMIN });
  await ctx.repos.devices.setStatus({ deviceId: device.id, status: 'lost', actor: ADMIN });
  const other = await ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id });
  await assert.rejects(ctx.repos.devices.assign({ deviceId: device.id, potterId: other.id, actor: ADMIN }), (e) => e.status === 409);
  // A device with no owner cannot be switched to active.
  const fresh = await ctx.repos.devices.register({ credentialHash: sha256('fresh') });
  await assert.rejects(ctx.repos.devices.setStatus({ deviceId: fresh.id, status: 'active', actor: ADMIN }), (e) => e.status === 409);
});

test('device writes cannot choose a potter: telemetry whitelist and upload API have no potterId input', async () => {
  const { device } = await potterWithDevice(ctx.repos);
  await assert.rejects(ctx.repos.devices.recordSeen(device.id, { potterId: 'POT-1' }), (e) => e.status === 400);
  await ctx.repos.devices.recordSeen(device.id, { batteryPct: 77, signalCsq: 20, firmwareVersion: '1.0.0' });
  const after = await ctx.repos.devices.get(device.id);
  assert.equal(after.batteryPct, 77);
  assert.ok(after.lastSeen);
  await assert.rejects(ctx.repos.devices.recordSeen('DEV-404', {}), (e) => e.status === 404);
});

test('reassign and credential rotation are audited atomically; the hash never reaches the audit log', async () => {
  const { potter, device } = await potterWithDevice(ctx.repos);
  const second = await ctx.repos.potters.create(newPotter(), { createdBy: ADMIN.id });
  const moved = await ctx.repos.devices.assign({ deviceId: device.id, potterId: second.id, actor: ADMIN });
  assert.equal(moved.potterId, second.id);
  assert.equal((await ctx.repos.devices.listByPotter(potter.id)).length, 0);

  const rotated = await ctx.repos.devices.rotateCredential({ deviceId: device.id, credentialHash: sha256('new'), actor: ADMIN });
  assert.equal(rotated.credentialVersion, 2);
  assert.equal((await ctx.repos.devices.getForAuth(device.id)).credentialHash, sha256('new'));

  const actions = (await ctx.db.collection('audit_logs').get()).docs
    .map((d) => d.data().action)
    .filter((a) => a !== 'potter.create')
    .sort();
  // One assign (test fixture), one reassign, one rotation.
  assert.deepEqual(actions, ['device.assign', 'device.reassign', 'device.rotate_secret']);
  assert.ok(!JSON.stringify((await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data())).includes(sha256('new')));
});

test('pending notifications follow the potter: re-targeted to another active device, or expired + order flagged', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture);
  const spare = await ctx.repos.devices.register({ credentialHash: sha256('spare') });
  await ctx.repos.devices.assign({ deviceId: spare.id, potterId: fixture.potter.id, actor: ADMIN });

  const order = await ctx.repos.orders.createWithHistory({
    productId: product.id,
    trackingTokenHash: sha256('t'),
    idempotencyKey: `key-${randomUUID()}`,
    buyerName: 'Karim',
    buyerPhone: '01812345678',
    deliveryAddress: 'House 1, Road 2, Dhaka',
    quantity: 1,
  });
  const note = await ctx.repos.notifications.create({ orderId: order.id, deviceId: fixture.device.id, type: 'NEW_ORDER' });
  assert.equal(note.deviceId, fixture.device.id);

  // Disabling the device moves the notification to the potter's other active device.
  await ctx.repos.devices.setStatus({ deviceId: fixture.device.id, status: 'disabled', actor: ADMIN });
  assert.equal((await ctx.repos.notifications.get(note.id)).deviceId, spare.id);
  assert.equal((await ctx.repos.orders.get(order.id)).needsAdminAttention, false);

  // Disabling the last active device expires it and flags the order for an admin.
  await ctx.repos.devices.setStatus({ deviceId: spare.id, status: 'lost', actor: ADMIN });
  assert.equal((await ctx.repos.notifications.get(note.id)).status, 'expired');
  const flagged = await ctx.repos.orders.get(order.id);
  assert.equal(flagged.needsAdminAttention, true);
  assert.equal(flagged.attentionReason, 'no_active_device');
});
