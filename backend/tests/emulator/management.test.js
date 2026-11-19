import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { connect, clearFirestore, uniquePhone } from './helpers.js';
import { emulatorSignUp, emulatorSignIn, startApi } from './authHelpers.js';
import { createAdminsService } from '../../src/services/admins.service.js';
import { createLogger } from '../../src/config/logger.js';

let ctx;
let api;
let admin;
let publicUser;
const logLines = [];

const PASSWORD = 'correct-horse-battery-1';
const sha = (s) => createHash('sha256').update(s).digest('hex');

before(async () => {
  ctx = connect('management');
  const admins = createAdminsService({ auth: ctx.firebase.auth, repos: ctx.repos });
  const logger = createLogger({ LOG_LEVEL: 'debug' }, { write: (line) => logLines.push(line) });
  api = await startApi(ctx, { failureLimit: 10_000, perAdminLimit: 10_000 }, { perDeviceLimit: 10_000 }, logger);

  const email = `mgmt-${randomUUID().slice(0, 8)}@example.com`;
  const { localId } = await emulatorSignUp(email, PASSWORD);
  await admins.grant({ email, name: 'Test Admin', role: 'admin' });
  admin = { uid: localId, token: await emulatorSignIn(email, PASSWORD) };

  const pubEmail = `pub-${randomUUID().slice(0, 8)}@example.com`;
  publicUser = { token: (await emulatorSignUp(pubEmail, PASSWORD)).idToken };
});
beforeEach(clearFirestore);
after(async () => {
  await api.close();
  await ctx.firebase.close();
});

const A = (method, path, body) => api.call(method, path, { token: admin.token, body });
const potterBody = (overrides = {}) => ({
  name: 'Rahim Uddin',
  phone: uniquePhone(),
  village: 'Pal Para',
  district: 'Dhaka',
  address: 'House 4, Pal Para, Savar, Dhaka',
  ...overrides,
});
const addPotter = async (overrides) => {
  const res = await A('POST', '/api/admin/potters', potterBody(overrides));
  assert.equal(res.status, 201, res.text);
  return res.body.potter;
};
const addDevice = async (body = {}) => {
  const res = await A('POST', '/api/admin/devices', body);
  assert.equal(res.status, 201, res.text);
  return { ...res.body.device, secret: res.body.provisioning.secret };
};
const assign = (deviceId, potterId) => A('POST', '/api/admin/devices/assign', { deviceId, potterId });
const activeDevice = async (potter, body) => {
  const device = await addDevice(body);
  assert.equal((await assign(device.id, potter.id)).status, 200);
  return device;
};
const beat = (device, body = {}, headers = {}) =>
  api.call('POST', '/api/device/heartbeat', {
    headers: { 'x-device-id': device.id, 'x-device-secret': device.secret, ...headers },
    body,
  });
const stored = async (collection, id) => (await ctx.db.collection(collection).doc(id).get()).data();

// ---------------------------------------------------------------------------------------------------------------
// Potters
// ---------------------------------------------------------------------------------------------------------------

test('1. registers a potter: generated ID, normalised phone, canonical district, no internal fields leaked', async () => {
  const res = await A('POST', '/api/admin/potters', potterBody({ phone: '+880 1712-345678', district: 'comilla' }));
  assert.equal(res.status, 201);
  const { potter } = res.body;
  assert.match(potter.id, /^POT-\d{4,}$/);
  assert.equal(potter.phone, '01712345678');
  assert.equal(potter.district, 'Cumilla');
  assert.equal(potter.status, 'active');
  assert.ok(potter.registrationDate);
  assert.ok(!('nameLower' in potter) && !('searchTokens' in potter));

  const second = await addPotter();
  assert.notEqual(second.id, potter.id);
  const audit = (await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data());
  assert.ok(audit.some((e) => e.action === 'potter.create' && e.actor.id === admin.uid), 'actor comes from the verified token');
  assert.ok(!JSON.stringify(audit).includes('01712345678'), 'phone numbers never enter the audit log');
});

test('1b. potter input is validated strictly', async () => {
  const bad = [
    { phone: '12345' },
    { phone: '02712345678' },
    { district: 'Atlantis' },
    { address: undefined },
    { name: 'x' },
    { status: 'inactive' },
    { id: 'POT-1' },
    { createdBy: 'someone' },
  ];
  for (const overrides of bad) {
    const body = potterBody(overrides);
    for (const k of Object.keys(overrides)) if (overrides[k] === undefined) delete body[k];
    const res = await A('POST', '/api/admin/potters', body);
    assert.equal(res.status, 400, JSON.stringify(overrides));
    assert.equal(res.body.error.code, 'BAD_REQUEST');
  }
  assert.equal((await ctx.db.collection('potters').get()).size, 0, 'nothing was created');
});

test('2. duplicate phone registration is rejected, in any format, including under concurrency', async () => {
  const first = await addPotter({ phone: '01712345678' });
  for (const phone of ['01712345678', '+8801712345678', '880 1712 345678']) {
    const res = await A('POST', '/api/admin/potters', potterBody({ phone }));
    assert.equal(res.status, 409, phone);
    assert.equal(res.body.error.code, 'DUPLICATE_PHONE');
  }
  const phone = '01999888777';
  const results = await Promise.all(Array.from({ length: 6 }, () => A('POST', '/api/admin/potters', potterBody({ phone }))));
  assert.equal(results.filter((r) => r.status === 201).length, 1, 'exactly one concurrent registration wins');
  assert.equal(results.filter((r) => r.status === 409).length, 5);
  const owners = (await ctx.db.collection('potters').where('phone', '==', phone).get()).size;
  assert.equal(owners, 1);
  assert.equal((await ctx.db.collection('potters').where('phone', '==', first.phone).get()).size, 1);
});

test('3. edits a potter; a phone change moves the reservation and cannot steal another potter\'s number', async () => {
  const a = await addPotter({ phone: '01711111111', name: 'Abdul Karim' });
  const b = await addPotter({ phone: '01722222222' });

  const edited = await A('PATCH', `/api/admin/potters/${a.id}`, { name: 'Abdul Karim Mia', village: 'Dhamrai', district: 'Gazipur' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.potter.name, 'Abdul Karim Mia');
  assert.equal(edited.body.potter.district, 'Gazipur');
  assert.equal(edited.body.potter.status, 'active', 'status is not editable here');

  const steal = await A('PATCH', `/api/admin/potters/${a.id}`, { phone: b.phone });
  assert.equal(steal.status, 409);
  assert.equal(steal.body.error.code, 'DUPLICATE_PHONE');

  const moved = await A('PATCH', `/api/admin/potters/${a.id}`, { phone: '01733333333' });
  assert.equal(moved.status, 200);
  assert.equal((await A('POST', '/api/admin/potters', potterBody({ phone: '01711111111' }))).status, 201, 'old number is free again');
  assert.equal((await A('POST', '/api/admin/potters', potterBody({ phone: '01733333333' }))).status, 409, 'new number is reserved');

  for (const body of [{}, { status: 'inactive' }, { id: 'POT-9' }, { phone: 'nope' }]) {
    assert.equal((await A('PATCH', `/api/admin/potters/${a.id}`, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await A('PATCH', '/api/admin/potters/POT-99999', { village: 'Nowhere' })).status, 404);
  assert.equal((await A('PATCH', '/api/admin/potters/not-an-id', { village: 'Nowhere' })).status, 400);

  const found = await A('GET', '/api/admin/potters?q=karim%20mia');
  assert.deepEqual(found.body.items.map((p) => p.id), [a.id], 'search sees the edited name');
});

test('4. activates and deactivates a potter (audited); the potter\'s devices are refused while inactive', async () => {
  const potter = await addPotter();
  const device = await activeDevice(potter);
  assert.equal((await beat(device)).status, 200);

  const off = await A('PATCH', `/api/admin/potters/${potter.id}/status`, { status: 'inactive' });
  assert.equal(off.status, 200);
  assert.equal(off.body.potter.status, 'inactive');
  assert.equal((await beat(device)).status, 403, 'a device of an inactive potter is refused');

  const on = await A('PATCH', `/api/admin/potters/${potter.id}/status`, { status: 'active' });
  assert.equal(on.body.potter.status, 'active');
  assert.equal((await beat(device)).status, 200);

  assert.equal((await A('PATCH', `/api/admin/potters/${potter.id}/status`, { status: 'banned' })).status, 400);
  assert.equal((await A('PATCH', `/api/admin/potters/${potter.id}/status`, {})).status, 400);
  const actions = (await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data().action);
  assert.ok(actions.includes('potter.deactivate') && actions.includes('potter.activate'));
});

test('potter list: pagination, status and district filters, and search by name, phone and ID', async () => {
  const created = [];
  for (let i = 0; i < 5; i++) {
    created.push(await addPotter({ name: `Potter Number ${i}`, district: i < 3 ? 'Dhaka' : 'Cumilla', village: i === 4 ? 'Kumarpara' : 'Pal Para' }));
  }
  await A('PATCH', `/api/admin/potters/${created[1].id}/status`, { status: 'inactive' });

  const seen = [];
  let cursor;
  do {
    const page = await A('GET', `/api/admin/potters?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(page.status, 200);
    assert.ok(page.body.items.length <= 2);
    seen.push(...page.body.items.map((p) => p.id));
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(new Set(seen).size, 5);

  const ids = async (qs) => (await A('GET', `/api/admin/potters?${qs}`)).body.items.map((p) => p.id).sort();
  assert.deepEqual(await ids('status=inactive'), [created[1].id]);
  assert.deepEqual(await ids('district=Cumilla'), [created[3].id, created[4].id].sort());
  assert.deepEqual(await ids('district=comilla&status=active'), [created[3].id, created[4].id].sort());
  assert.deepEqual(await ids('q=potter%20number%202'), [created[2].id]);
  assert.deepEqual(await ids(`q=${created[0].phone}`), [created[0].id]);
  assert.deepEqual(await ids(`q=${encodeURIComponent(`+88${created[0].phone}`)}`), [created[0].id]);
  assert.deepEqual(await ids(`q=${created[3].id}`), [created[3].id]);
  assert.deepEqual(await ids('q=kumarpara'), [created[4].id]);
  assert.deepEqual(await ids('q=Potter&district=Cumilla'), [created[3].id, created[4].id].sort());
  assert.equal((await A('GET', '/api/admin/potters?district=Atlantis')).status, 400);
  assert.equal((await A('GET', '/api/admin/potters?bogus=1')).status, 400);
});

test('potter profile: devices (never secrets) and counts', async () => {
  const potter = await addPotter();
  const d1 = await activeDevice(potter);
  await activeDevice(potter);
  await addDevice();
  const res = await A('GET', `/api/admin/potters/${potter.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.potter.id, potter.id);
  assert.equal(res.body.devices.length, 2);
  assert.equal(res.body.counts.devices, 2);
  assert.ok(res.body.devices.some((d) => d.id === d1.id));
  assert.ok(!res.text.includes(d1.secret) && !res.text.includes('credentialHash'));
  assert.equal((await A('GET', '/api/admin/potters/POT-99999')).status, 404);
  assert.equal((await A('GET', '/api/admin/potters/xyz')).status, 400);
});

// ---------------------------------------------------------------------------------------------------------------
// Devices: registration and credentials
// ---------------------------------------------------------------------------------------------------------------

test('5. registers a device: secret returned once, only its SHA-256 digest stored, never visible afterwards', async () => {
  const res = await A('POST', '/api/admin/devices', { model: 'ESP32-S3 + A7670E' });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { device, provisioning } = res.body;
  assert.match(device.id, /^DEV-\d{3,}$/);
  assert.equal(device.status, 'unassigned');
  assert.equal(device.model, 'ESP32-S3 + A7670E');
  assert.equal(device.hasCredential, true);
  assert.equal(provisioning.deviceId, device.id);
  assert.equal(provisioning.shownOnce, true);
  assert.match(provisioning.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!('credentialHash' in device) && !('secret' in device));

  const doc = await stored('devices', device.id);
  assert.equal(doc.credentialHash, sha(provisioning.secret));
  assert.ok(!JSON.stringify(doc).includes(provisioning.secret), 'the plain secret is not in Firestore');
  assert.equal(device.credentialFingerprint, doc.credentialHash.slice(0, 8));

  const everywhere = [
    (await A('GET', `/api/admin/devices/${device.id}`)).text,
    (await A('GET', '/api/admin/devices')).text,
    (await A('GET', `/api/admin/devices/${device.id}/audit`)).text,
    (await A('GET', `/api/admin/devices/${device.id}/events`)).text,
    JSON.stringify((await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data())),
    logLines.join('\n'),
  ].join('\n');
  assert.ok(!everywhere.includes(provisioning.secret), 'secret appears in no read API, audit entry or log line');
  assert.ok(!everywhere.includes(doc.credentialHash), 'neither does the stored digest');
});

test('5b. device input is validated strictly', async () => {
  for (const body of [{ model: 'x' }, { pollIntervalSec: 5 }, { potterId: 'POT-1001' }, { credentialHash: 'a'.repeat(64) }, { secret: 'mine' }, { status: 'active' }]) {
    assert.equal((await A('POST', '/api/admin/devices', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await ctx.db.collection('devices').get()).size, 0);
});

test('6. device IDs are unique under concurrency, and a stale counter can never overwrite a device', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => A('POST', '/api/admin/devices', {})));
  assert.ok(results.every((r) => r.status === 201));
  const ids = results.map((r) => r.body.device.id);
  assert.equal(new Set(ids).size, 8);
  const secrets = results.map((r) => r.body.provisioning.secret);
  assert.equal(new Set(secrets).size, 8, 'every device gets its own secret');

  const victim = ids[0];
  const before = await stored('devices', victim);
  await ctx.db.collection('counters').doc('device').set({ value: 0 });
  const clash = await A('POST', '/api/admin/devices', {});
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'ID_COLLISION');
  assert.deepEqual(await stored('devices', victim), before, 'the existing device is untouched');
});

// ---------------------------------------------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------------------------------------------

test('7-8. assigns a device; one potter can own several devices', async () => {
  const potter = await addPotter();
  const devices = [await addDevice(), await addDevice(), await addDevice()];
  for (const d of devices) {
    const res = await assign(d.id, potter.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.device.potterId, potter.id);
    assert.equal(res.body.device.status, 'active');
    assert.equal(res.body.device.potter.name, potter.name);
  }
  const profile = await A('GET', `/api/admin/potters/${potter.id}`);
  assert.deepEqual(profile.body.devices.map((d) => d.id).sort(), devices.map((d) => d.id).sort());
  assert.equal(profile.body.counts.devices, 3);
  assert.equal((await assign(devices[0].id, potter.id)).status, 200, 'assigning again to the same owner is idempotent');
});

test('9. reassigns a device; ownership is exclusive and consistent even with racing requests', async () => {
  const p1 = await addPotter();
  const p2 = await addPotter();
  const p3 = await addPotter();
  const device = await activeDevice(p1);

  const moved = await assign(device.id, p2.id);
  assert.equal(moved.body.device.potterId, p2.id);
  const owned = async (p) => (await A('GET', `/api/admin/potters/${p.id}`)).body.devices.map((d) => d.id);
  assert.deepEqual(await owned(p1), []);
  assert.deepEqual(await owned(p2), [device.id]);

  await Promise.all([assign(device.id, p1.id), assign(device.id, p3.id)]);
  const holders = [];
  for (const p of [p1, p2, p3]) if ((await owned(p)).includes(device.id)) holders.push(p.id);
  assert.equal(holders.length, 1, 'a device is never owned by two potters');
  assert.equal((await stored('devices', device.id)).potterId, holders[0]);

  const actions = (await ctx.db.collection('audit_logs').where('target.id', '==', device.id).get()).docs.map((d) => d.data().action);
  assert.ok(actions.includes('device.reassign'));
  // The heartbeat of the moved device resolves to its CURRENT owner.
  const hb = await beat(device);
  assert.equal(hb.status, 200);
  const events = (await ctx.db.collection('device_events').where('deviceId', '==', device.id).get()).docs.map((d) => d.data());
  assert.equal(events[0].potterId, holders[0]);
});

test('10. rejects invalid assignments', async () => {
  const potter = await addPotter();
  const device = await addDevice();
  const inactive = await addPotter();
  await A('PATCH', `/api/admin/potters/${inactive.id}/status`, { status: 'inactive' });

  const cases = [
    [{ deviceId: 'DEV-999', potterId: potter.id }, 404],
    [{ deviceId: device.id, potterId: 'POT-99999' }, 404],
    [{ deviceId: device.id, potterId: inactive.id }, 409],
    [{ deviceId: 'nope', potterId: potter.id }, 400],
    [{ deviceId: device.id, potterId: 'nope' }, 400],
    [{ deviceId: device.id }, 400],
    [{ deviceId: device.id, potterId: potter.id, status: 'active' }, 400],
    [{ deviceId: device.id, potterId: [potter.id, inactive.id] }, 400],
  ];
  for (const [body, status] of cases) {
    const res = await A('POST', '/api/admin/devices/assign', body);
    assert.equal(res.status, status, JSON.stringify(body));
  }
  assert.equal((await stored('devices', device.id)).potterId, null, 'no failed attempt changed ownership');

  await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'disabled' });
  const disabled = await assign(device.id, potter.id);
  assert.equal(disabled.status, 409);
  assert.equal(disabled.body.error.code, 'DEVICE_NOT_ASSIGNABLE');
});

// ---------------------------------------------------------------------------------------------------------------
// Revocation, status changes and device authentication
// ---------------------------------------------------------------------------------------------------------------

test('11. revokes credentials: the device stops authenticating at once, the digest is deleted, the action is idempotent', async () => {
  const potter = await addPotter();
  const device = await activeDevice(potter);
  assert.equal((await beat(device)).status, 200);

  const res = await A('POST', `/api/admin/devices/${device.id}/revoke`, { reason: 'Device handed back' });
  assert.equal(res.status, 200);
  assert.equal(res.body.device.hasCredential, false);
  assert.equal(res.body.device.credentialFingerprint, null);
  assert.equal(res.body.device.status, 'disabled');
  assert.equal(res.body.device.credentialVersion, 2);
  assert.ok(res.body.device.credentialRevokedAt);
  assert.equal((await stored('devices', device.id)).credentialHash, null);

  const rejected = await beat(device);
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.error.code, 'UNAUTHORIZED');

  const again = await A('POST', `/api/admin/devices/${device.id}/revoke`, {});
  assert.equal(again.status, 200);
  assert.equal(again.body.device.credentialVersion, 2, 'revoking twice does not bump the version again');
  const revokes = (await ctx.db.collection('audit_logs').where('action', '==', 'device.revoke_credential').get()).size;
  assert.equal(revokes, 1);

  const enable = await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'active' });
  assert.equal(enable.status, 409, 'cannot enable a device without a credential');
  assert.equal(enable.body.error.code, 'NO_CREDENTIAL');

  const reissued = await A('POST', `/api/admin/devices/${device.id}/credentials`, {});
  assert.equal(reissued.status, 201);
  assert.equal(reissued.headers.get('cache-control'), 'no-store');
  const fresh = { id: device.id, secret: reissued.body.provisioning.secret };
  assert.notEqual(fresh.secret, device.secret);
  assert.equal(reissued.body.device.status, 'disabled', 'reissuing does not silently re-enable the device');
  assert.equal((await beat(device)).status, 401, 'the old secret never works again');
  assert.equal((await beat(fresh)).status, 403, 'new secret is valid but the device is still disabled');

  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'active' })).status, 200);
  assert.equal((await beat(fresh)).status, 200);
});

test('11b. marking a device lost revokes its credentials in the same step and cannot be undone by reissuing', async () => {
  const potter = await addPotter();
  const device = await activeDevice(potter);
  const lost = await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'lost', reason: 'Stolen from the market' });
  assert.equal(lost.status, 200);
  assert.equal(lost.body.device.status, 'lost');
  assert.equal(lost.body.device.hasCredential, false);
  assert.equal((await beat(device)).status, 401);

  const reissue = await A('POST', `/api/admin/devices/${device.id}/credentials`, {});
  assert.equal(reissue.status, 409);
  assert.equal(reissue.body.error.code, 'DEVICE_LOST');
  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'active' })).status, 409);
  assert.equal((await assign(device.id, potter.id)).status, 409);

  // Recovery is deliberate: lost -> disabled -> new credentials -> active.
  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'disabled' })).status, 200);
  const fresh = (await A('POST', `/api/admin/devices/${device.id}/credentials`, {})).body.provisioning;
  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'active' })).status, 200);
  assert.equal((await beat({ id: device.id, secret: fresh.secret })).status, 200);

  const trail = (await A('GET', `/api/admin/devices/${device.id}/audit`)).body.items;
  const markLost = trail.find((e) => e.action === 'device.mark_lost');
  assert.equal(markLost.after.reason, 'Stolen from the market');
  assert.equal(markLost.after.credentialRevoked, true);
  assert.equal(markLost.actor.id, admin.uid);
});

test('12. a disabled, lost, unassigned or revoked device cannot authenticate; authentication never reveals which check failed', async () => {
  const potter = await addPotter();
  const good = await activeDevice(potter);
  assert.equal((await beat(good)).status, 200);

  const unassigned = await addDevice();
  assert.equal((await beat(unassigned)).status, 403, 'valid secret but no owner');

  await A('PATCH', `/api/admin/devices/${good.id}/status`, { status: 'disabled' });
  const disabled = await beat(good);
  assert.equal(disabled.status, 403);
  const lastSeenBefore = (await stored('devices', good.id)).lastSeen;

  const wrongSecret = await beat({ id: good.id, secret: 'A'.repeat(43) });
  const unknownDevice = await beat({ id: 'DEV-9999', secret: good.secret });
  const garbage = await beat({ id: good.id, secret: 'short' });
  const missing = await api.call('POST', '/api/device/heartbeat', { body: {} });
  const noBearerButAdminToken = await api.call('POST', '/api/device/heartbeat', { token: admin.token, body: {} });
  for (const res of [wrongSecret, unknownDevice, garbage, missing, noBearerButAdminToken]) {
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Invalid device credentials', 'one generic message for every credential failure');
  }
  assert.deepEqual((await stored('devices', good.id)).lastSeen, lastSeenBefore, 'refused requests never update lastSeen');

  const events = (await ctx.db.collection('device_events').where('deviceId', '==', good.id).get()).docs.map((d) => d.data());
  assert.ok(events.some((e) => e.type === 'rejected' && e.reason === 'device_disabled'), 'a refused-but-authentic request is recorded');
});

test('device heartbeat: records telemetry and history, resolves the potter from the device record, ignores everything the device claims', async () => {
  const p1 = await addPotter();
  const p2 = await addPotter();
  const d1 = await activeDevice(p1);
  const d2 = await activeDevice(p2);

  const ok = await beat(d1, { firmwareVersion: '1.2.3', batteryPct: 87, signalCsq: 21, queuedUploads: 2 }, { 'x-potter-id': p2.id, 'x-forwarded-for': '1.2.3.4' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.serverTime);
  assert.equal(ok.body.pollIntervalSec, 300);

  const doc = await stored('devices', d1.id);
  assert.equal(doc.firmwareVersion, '1.2.3');
  assert.equal(doc.batteryPct, 87);
  assert.ok(doc.lastSeen instanceof Timestamp);
  assert.equal((await stored('devices', d2.id)).lastSeen, null, 'another potter\'s device is untouched');

  const events = (await ctx.db.collection('device_events').get()).docs.map((d) => d.data());
  assert.equal(events.length, 1);
  assert.equal(events[0].deviceId, d1.id);
  assert.equal(events[0].potterId, p1.id, 'owner comes from the authenticated record, not the x-potter-id header');
  assert.ok(events[0].expireAt instanceof Timestamp);

  for (const body of [{ potterId: p2.id }, { deviceId: d2.id }, { batteryPct: 101 }, { status: 'active' }, { credentialHash: 'x' }]) {
    const res = await beat(d1, body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal((await ctx.db.collection('device_events').get()).size, 1, 'rejected bodies leave no history');

  const feed = await A('GET', `/api/admin/devices/${d1.id}/events`);
  assert.equal(feed.status, 200);
  assert.equal(feed.body.items.length, 1);
  assert.equal(feed.body.items[0].type, 'heartbeat');
  assert.equal(feed.body.items[0].batteryPct, 87);
  assert.equal((await A('GET', '/api/admin/devices/DEV-9999/events')).status, 404);
});

test('device authentication is throttled only after failures, and valid devices are never blocked by them', async () => {
  const strict = await startApi(ctx, {}, { failureLimit: 3, perDeviceLimit: 10_000 });
  try {
    const potter = await addPotter();
    const device = await activeDevice(potter);
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await strict.call('POST', '/api/device/heartbeat', { headers: { 'x-device-id': device.id, 'x-device-secret': 'B'.repeat(43) }, body: {} });
      statuses.push(res.status);
      if (res.status === 429) assert.ok(res.headers.get('retry-after'));
    }
    assert.deepEqual(statuses.slice(0, 3), [401, 401, 401]);
    assert.ok(statuses.slice(3).every((s) => s === 429));
    const valid = await strict.call('POST', '/api/device/heartbeat', { headers: { 'x-device-id': device.id, 'x-device-secret': device.secret }, body: {} });
    assert.equal(valid.status, 200, 'a device with the right secret gets through even from a throttled address');
  } finally {
    await strict.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Authorization and isolation
// ---------------------------------------------------------------------------------------------------------------

test('13. unauthenticated, role-less and device callers cannot reach any management API', async () => {
  const potter = await addPotter();
  const device = await activeDevice(potter);
  const endpoints = [
    ['POST', '/api/admin/potters', potterBody()],
    ['GET', '/api/admin/potters'],
    ['GET', `/api/admin/potters/${potter.id}`],
    ['PATCH', `/api/admin/potters/${potter.id}`, { village: 'Hacked' }],
    ['PATCH', `/api/admin/potters/${potter.id}/status`, { status: 'inactive' }],
    ['POST', '/api/admin/devices', {}],
    ['GET', '/api/admin/devices'],
    ['GET', `/api/admin/devices/${device.id}`],
    ['GET', `/api/admin/devices/${device.id}/events`],
    ['GET', `/api/admin/devices/${device.id}/audit`],
    ['POST', '/api/admin/devices/assign', { deviceId: device.id, potterId: potter.id }],
    ['PATCH', `/api/admin/devices/${device.id}/status`, { status: 'lost' }],
    ['POST', `/api/admin/devices/${device.id}/revoke`, {}],
    ['POST', `/api/admin/devices/${device.id}/credentials`, {}],
    ['GET', '/api/admin/meta'],
  ];
  for (const [method, path, body] of endpoints) {
    const none = await api.call(method, path, { body });
    assert.equal(none.status, 401, `${method} ${path} without a token`);
    const roleless = await api.call(method, path, { token: publicUser.token, body });
    assert.equal(roleless.status, 403, `${method} ${path} with a role-less token`);
    const asDevice = await api.call(method, path, { headers: { 'x-device-id': device.id, 'x-device-secret': device.secret }, body });
    assert.equal(asDevice.status, 401, `${method} ${path} with device credentials`);
  }
  const untouched = await stored('potters', potter.id);
  assert.equal(untouched.village, 'Pal Para');
  assert.equal(untouched.status, 'active');
  assert.equal((await stored('devices', device.id)).status, 'active');
});

test('14. a potter\'s device can only act for its own potter; one potter\'s data never appears under another', async () => {
  const p1 = await addPotter();
  const p2 = await addPotter();
  const d1 = await activeDevice(p1);
  const d2 = await activeDevice(p2);
  await activeDevice(p2);

  assert.equal((await beat(d1)).status, 200);
  // d1 presenting d2's id with its own secret, or the reverse, fails; secrets are bound to one device.
  assert.equal((await beat({ id: d2.id, secret: d1.secret })).status, 401);
  assert.equal((await beat({ id: d1.id, secret: d2.secret })).status, 401);
  // A device cannot name another potter anywhere.
  assert.equal((await beat(d1, { potterId: p2.id })).status, 400);
  assert.equal((await api.call('POST', `/api/device/heartbeat?potterId=${p2.id}`, { headers: { 'x-device-id': d1.id, 'x-device-secret': d1.secret }, body: {} })).status, 400);

  const events = (await ctx.db.collection('device_events').get()).docs.map((d) => d.data());
  assert.ok(events.every((e) => e.deviceId === d1.id && e.potterId === p1.id));
  assert.equal((await stored('devices', d2.id)).lastSeen, null);

  const prof1 = (await A('GET', `/api/admin/potters/${p1.id}`)).body;
  const prof2 = (await A('GET', `/api/admin/potters/${p2.id}`)).body;
  assert.deepEqual(prof1.devices.map((d) => d.id), [d1.id]);
  assert.equal(prof2.devices.length, 2);
  assert.ok(prof2.devices.every((d) => d.potterId === p2.id));
  assert.equal(prof1.counts.devices, 1);
  assert.equal(prof2.counts.devices, 2);

  // Deactivating one potter leaves the other's devices working.
  await A('PATCH', `/api/admin/potters/${p1.id}/status`, { status: 'inactive' });
  assert.equal((await beat(d1)).status, 403);
  assert.equal((await beat(d2)).status, 200);
});

// ---------------------------------------------------------------------------------------------------------------
// Device listing, filtering, search
// ---------------------------------------------------------------------------------------------------------------

test('device list: status filters (including derived online/offline), ID search, pagination, potter names', async () => {
  const potter = await addPotter({ name: 'Nasima Begum' });
  const online = await activeDevice(potter);
  const never = await activeDevice(potter);
  const stale = await activeDevice(potter);
  const unassigned = await addDevice();
  const disabled = await activeDevice(potter);
  const lost = await activeDevice(potter);
  await A('PATCH', `/api/admin/devices/${disabled.id}/status`, { status: 'disabled' });
  await A('PATCH', `/api/admin/devices/${lost.id}/status`, { status: 'lost' });
  assert.equal((await beat(online)).status, 200);
  await ctx.db.collection('devices').doc(stale.id).update({ lastSeen: Timestamp.fromMillis(Date.now() - 3 * 3600 * 1000) });

  const ids = async (qs) => (await A('GET', `/api/admin/devices?${qs}`)).body.items.map((d) => d.id).sort();
  assert.deepEqual(await ids('status=active'), [online.id]);
  assert.deepEqual(await ids('status=offline'), [never.id, stale.id].sort());
  assert.deepEqual(await ids('status=unassigned'), [unassigned.id]);
  assert.deepEqual(await ids('status=disabled'), [disabled.id]);
  assert.deepEqual(await ids('status=lost'), [lost.id]);
  assert.equal((await ids('')).length, 6);
  assert.equal((await A('GET', '/api/admin/devices?status=bogus')).status, 400);

  assert.deepEqual(await ids(`q=${online.id}`), [online.id]);
  assert.deepEqual(await ids(`q=${online.id.toLowerCase()}`), [online.id]);
  assert.deepEqual(await ids(`q=DEV-00&status=lost`), [lost.id]);
  assert.deepEqual(await ids('q=DEV-00&status=offline'), [never.id, stale.id].sort());
  assert.deepEqual(await ids('q=DEV-777'), []);

  const list = (await A('GET', '/api/admin/devices?status=offline')).body.items;
  const byId = Object.fromEntries(list.map((d) => [d.id, d]));
  assert.equal(byId[never.id].connectivity, 'never_seen');
  assert.equal(byId[stale.id].connectivity, 'offline');
  assert.equal(byId[stale.id].displayStatus, 'offline');
  assert.equal(byId[stale.id].potter.name, 'Nasima Begum');
  const single = (await A('GET', `/api/admin/devices/${online.id}`)).body.device;
  assert.equal(single.connectivity, 'online');
  assert.equal(single.displayStatus, 'active');
  assert.equal(single.potter.id, potter.id);

  const seen = [];
  let cursor;
  do {
    const page = await A('GET', `/api/admin/devices?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    seen.push(...page.body.items.map((d) => d.id));
    cursor = page.body.nextCursor;
  } while (cursor);
  assert.equal(new Set(seen).size, 6);
});

test('GET /api/admin/meta lists the 64 districts', async () => {
  const res = await A('GET', '/api/admin/meta');
  assert.equal(res.status, 200);
  assert.equal(res.body.districts.length, 64);
  assert.ok(res.body.deviceStatuses.includes('offline'));
});

test('administrative device history lists who did what, newest first', async () => {
  const potter = await addPotter();
  const device = await activeDevice(potter);
  await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'disabled', reason: 'Battery swollen' });
  const trail = (await A('GET', `/api/admin/devices/${device.id}/audit`)).body.items;
  assert.deepEqual(trail.map((e) => e.action), ['device.disable', 'device.assign', 'device.register']);
  assert.equal(trail[0].after.reason, 'Battery swollen');
  assert.equal(trail[0].actor.id, admin.uid);
  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'unassigned' })).status, 400);
  assert.equal((await A('PATCH', `/api/admin/devices/${device.id}/status`, { status: 'disabled', reason: 'x' })).status, 400);
});
