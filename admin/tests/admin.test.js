import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFirebaseConfig } from '../src/lib/firebaseConfig.js';
import { friendlyAuthError } from '../src/utils/authErrors.js';
import { formatRelative, formatNumber, formatBdt, initials, formatDuration } from '../src/utils/format.js';
import { describeActivity, actorLabel } from '../src/utils/activity.js';
import { attentionItems } from '../src/layouts/attention.js';
import {
  ORDER_STATUS_META, PRODUCT_STATUS_META, DEVICE_STATUS_META, POTTER_STATUS_META, ROLE_META, NAV_ITEMS, ACTIVITY_VERBS, TONES,
} from '../src/utils/constants.js';
// The backend is the authority for enum values: the UI must have display metadata for every one of them.
import {
  ORDER_STATUS, PRODUCT_STATUS, DEVICE_STATUS, POTTER_STATUS, ADMIN_ROLES,
} from '../../backend/src/db/enums.js';

const validEnv = {
  VITE_FIREBASE_API_KEY: 'public-web-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
};

test('firebase web config: validates, refuses admin credentials and production emulators', () => {
  assert.equal(readFirebaseConfig(validEnv).config.projectId, 'demo-project');
  assert.throws(() => readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'x' }), /VITE_FIREBASE_AUTH_DOMAIN/);
  assert.throws(() => readFirebaseConfig({ ...validEnv, VITE_SERVICE_ACCOUNT_JSON: '{}' }), /Admin SDK credential/);
  assert.throws(() => readFirebaseConfig({ ...validEnv, VITE_X: '-----BEGIN PRIVATE KEY-----' }), /Admin SDK credential/);
  assert.throws(() => readFirebaseConfig({ ...validEnv, VITE_USE_FIREBASE_EMULATORS: 'true', PROD: true }), /production/);
});

test('login errors never reveal whether the email or the password was wrong', () => {
  const generic = 'Invalid email or password.';
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email']) {
    assert.equal(friendlyAuthError({ code }), generic, code);
  }
  assert.match(friendlyAuthError({ code: 'auth/too-many-requests' }), /Too many attempts/);
  assert.match(friendlyAuthError({ code: 'auth/user-disabled' }), /disabled/);
  assert.match(friendlyAuthError(new Error('boom')), /Sign-in failed/);
  assert.ok(!friendlyAuthError({ code: 'auth/user-not-found' }).includes('not found'));
});

test('connection failures name the real target: the local emulator vs the internet', () => {
  const failed = { code: 'auth/network-request-failed' };
  const emulator = friendlyAuthError(failed, { useEmulators: true, authEmulatorUrl: 'http://127.0.0.1:9099' });
  assert.match(emulator, /Firebase Auth emulator at http:\/\/127\.0\.0\.1:9099/);
  assert.match(emulator, /npm run emulators/);
  assert.match(emulator, /Java 21/);
  assert.match(friendlyAuthError(failed, { useEmulators: false }), /internet connection/);
  assert.match(friendlyAuthError(failed), /internet connection/);
});

test('reachability probe: refused connection is unreachable, any HTTP answer is reachable', async () => {
  const { createServer } = await import('node:http');
  const { isReachable } = await import('../src/hooks/useReachable.js');
  const server = createServer((_req, res) => res.writeHead(404).end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  assert.equal(await isReachable(`http://127.0.0.1:${port}`), true, '404 still means the service is up');
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isReachable(`http://127.0.0.1:${port}`), false, 'connection refused');
});

test('formatting helpers', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  assert.equal(formatRelative('2026-11-19T11:59:40Z', now), 'just now');
  assert.equal(formatRelative('2026-11-19T11:30:00Z', now), '30 min ago');
  assert.equal(formatRelative('2026-11-19T09:00:00Z', now), '3 h ago');
  assert.equal(formatRelative('2026-11-17T12:00:00Z', now), '2 d ago');
  assert.equal(formatRelative('nonsense', now), '—');
  assert.equal(formatNumber(12345), '12,345');
  assert.equal(formatNumber(undefined), '—');
  assert.match(formatBdt(1200), /1,200/);
  assert.equal(initials('Priya Das'), 'PD');
  assert.equal(initials('admin@example.com'), 'AE');
  assert.equal(initials(''), '?');
  assert.equal(formatDuration(900), '15 minutes');
  assert.equal(formatDuration(3600), '1 hour');
});

test('status metadata covers every backend status, role and device state (API contract)', () => {
  const covers = (meta, values, name) => {
    for (const v of values) {
      assert.ok(meta[v], `${name}: missing display metadata for "${v}"`);
      assert.ok(meta[v].label && TONES[meta[v].tone], `${name}.${v} needs a label and a known tone`);
    }
  };
  covers(ORDER_STATUS_META, ORDER_STATUS, 'order');
  covers(PRODUCT_STATUS_META, PRODUCT_STATUS, 'product');
  covers(DEVICE_STATUS_META, DEVICE_STATUS, 'device');
  covers(POTTER_STATUS_META, POTTER_STATUS, 'potter');
  covers(ROLE_META, ADMIN_ROLES, 'role');
});

test('sidebar exposes exactly the requested sections, and unbuilt ones say when they arrive', () => {
  assert.deepEqual(NAV_ITEMS.map((i) => i.label), ['Overview', 'Potters', 'Devices', 'Products', 'Orders', 'Customers', 'Reports', 'Settings']);
  for (const item of NAV_ITEMS.filter((i) => i.phase)) assert.ok(item.blurb && /^Phase \d+$/.test(item.phase), item.label);
  assert.equal(new Set(NAV_ITEMS.map((i) => i.to)).size, NAV_ITEMS.length);
});

test('activity wording: known actions are humanised, unknown ones fall back to the raw code', () => {
  const item = { action: 'potter.deactivate', actor: { type: 'admin', id: 'abcdef123456', name: 'Priya' }, target: { id: 'POT-1001', label: 'Rahim Uddin (POT-1001)' } };
  assert.deepEqual(describeActivity(item), { actor: 'Priya', verb: 'deactivated potter', subject: 'Rahim Uddin (POT-1001)' });
  assert.equal(describeActivity({ ...item, target: { id: 'POT-1001', label: null } }).subject, 'POT-1001');
  assert.equal(describeActivity({ ...item, target: { id: 'KVVJlylxCNUyE4w4sSfsABCDEFGHIJ', label: null } }).subject, 'KVVJlylx…');
  assert.equal(describeActivity({ ...item, action: 'weird.new_action' }).verb, 'weird.new_action');
  assert.equal(actorLabel({ type: 'system', id: 'admin-cli' }), 'Platform operator');
  assert.equal(actorLabel({ type: 'system', id: 'seed-demo' }), 'System');
  assert.equal(actorLabel({ type: 'device', id: 'DEV-001' }), 'Device DEV-001');
  assert.match(actorLabel({ type: 'admin', id: 'abcdef123456', name: null }), /^Admin abcdef/);
  assert.ok(Object.keys(ACTIVITY_VERBS).length > 5);
});

test('notification bell lists only real, non-zero attention items', () => {
  assert.deepEqual(attentionItems(null), []);
  const summary = (o, p, d) => ({ counts: { orders: { needsAttention: o }, products: { pendingApproval: p }, devices: { offline: d } } });
  assert.deepEqual(attentionItems(summary(0, 0, 0)), []);
  assert.deepEqual(attentionItems(summary(2, 0, 1)).map((i) => [i.key, i.count, i.text]), [['orders', 2, 'orders need follow-up'], ['devices', 1, 'active device offline']]);
});

test('phone validation in the browser matches the backend normaliser exactly', async () => {
  const { normalizeBdPhone: ui, formatBdPhone } = await import('../src/utils/phone.js');
  const { normalizeBdPhone: server } = await import('../../backend/src/utils/phone.js');
  const samples = ['01712345678', '+8801712345678', '8801712345678', '+880 1712-345678', '(017) 12345678', '01212345678', '0171234567', '017123456789', 'abc', '', ' ', '+88001712345678', '01912345678', null, 1712345678];
  for (const s of samples) assert.equal(ui(s), server(s), `input: ${JSON.stringify(s)}`);
  assert.equal(formatBdPhone('01712345678'), '01712-345678');
  assert.equal(formatBdPhone(undefined), '—');
});

test('potter form validation: required fields, phone format, district list; values are normalised for the API', async () => {
  const { validatePotterForm, validateDeviceForm, fieldErrorsFromApi } = await import('../src/utils/validation.js');
  const good = { name: ' Rahim Uddin ', phone: '+880 1712-345678', village: 'Pal Para', district: 'Dhaka', address: 'House 4, Savar' };
  const ok = validatePotterForm(good, ['Dhaka', 'Cumilla']);
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.values, { name: 'Rahim Uddin', phone: '01712345678', village: 'Pal Para', district: 'Dhaka', address: 'House 4, Savar' });

  const bad = validatePotterForm({ name: 'R', phone: '12345', village: '', district: 'Atlantis', address: 'x' }, ['Dhaka']);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['address', 'district', 'name', 'phone', 'village']);
  assert.equal(validatePotterForm({ ...good, district: '' }, ['Dhaka']).errors.district, 'Choose a district.');

  assert.deepEqual(validateDeviceForm({ model: '', pollIntervalSec: '' }), {});
  assert.deepEqual(validateDeviceForm({ model: 'ESP32-S3', pollIntervalSec: '300' }), {});
  assert.ok(validateDeviceForm({ model: 'x', pollIntervalSec: '5' }).pollIntervalSec);
  assert.ok(validateDeviceForm({ model: 'x', pollIntervalSec: '1.5' }).pollIntervalSec);
  assert.deepEqual(fieldErrorsFromApi({ details: [{ path: 'phone', message: 'bad' }, { path: 'phone', message: 'second' }] }), { phone: 'bad' });
  assert.deepEqual(fieldErrorsFromApi(undefined), {});
});

test('device filters and audit wording match the backend API contract', async () => {
  const { DEVICE_FILTER_OPTIONS, CONNECTIVITY_META } = await import('../src/utils/constants.js');
  const { DEVICE_FILTER_STATUS } = await import('../../backend/src/validators/admin.validators.js');
  assert.deepEqual([...DEVICE_FILTER_OPTIONS].sort(), [...DEVICE_FILTER_STATUS].sort());
  for (const status of DEVICE_FILTER_OPTIONS) assert.ok(DEVICE_STATUS_META[status], `status meta for ${status}`);
  for (const key of ['online', 'offline', 'never_seen']) assert.ok(CONNECTIVITY_META[key]);
  for (const action of ['potter.create', 'potter.update', 'device.register', 'device.revoke_credential', 'device.rotate_secret', 'device.mark_lost']) {
    assert.ok(ACTIVITY_VERBS[action], `activity wording for ${action}`);
  }
});

test('sidebar links for potters and devices are live pages, not placeholders', () => {
  for (const label of ['Potters', 'Devices']) assert.equal(NAV_ITEMS.find((i) => i.label === label).phase, undefined);
});
