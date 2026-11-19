import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOrderId, formatPotterId, formatDeviceId, uploadDocId, notificationDocId, ID_PATTERNS } from '../../src/utils/ids.js';
import { normalizeBdPhone } from '../../src/utils/phone.js';
import { buildSearchTokens } from '../../src/utils/search.js';
import { pickDeliveryDevice } from '../../src/repositories/devices.repository.js';
import { encodeCursor, decodeCursor, normalizeLimit } from '../../src/repositories/query.js';

test('ID formats match the design and the patterns', () => {
  assert.equal(formatPotterId(1001), 'POT-1001');
  assert.equal(formatDeviceId(1), 'DEV-001');
  assert.equal(formatDeviceId(1234), 'DEV-1234');
  assert.match(formatPotterId(1001), ID_PATTERNS.potter);
  assert.match(formatDeviceId(7), ID_PATTERNS.device);
  assert.match(notificationDocId('ORD-ABCDEFGHJK', 'NEW_ORDER'), ID_PATTERNS.notification);
  assert.equal(uploadDocId('DEV-001', 'cap_12345678'), 'DEV-001_cap_12345678');
});

test('order IDs are well-formed and unique', () => {
  const ids = new Set(Array.from({ length: 2000 }, generateOrderId));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, ID_PATTERNS.order);
});

test('Bangladeshi phone normalisation', () => {
  assert.equal(normalizeBdPhone('01712345678'), '01712345678');
  assert.equal(normalizeBdPhone('+880 1712-345678'), '01712345678');
  assert.equal(normalizeBdPhone('8801912345678'), '01912345678');
  for (const bad of ['0171234567', '02712345678', 'abc', '', null, 1712345678]) assert.equal(normalizeBdPhone(bad), null);
});

test('search tokens are lower-case, deduplicated and bounded', () => {
  assert.deepEqual(buildSearchTokens({ name: 'Handmade Terracotta Vase', tags: ['Terracotta', 'a'], category: 'Home Decoration' }), [
    'handmade',
    'terracotta',
    'vase',
    'home',
    'decoration',
  ]);
  assert.equal(buildSearchTokens({ name: Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ') }).length, 30);
});

test('delivery device: active only, most recently seen first, never-seen last', () => {
  const d = (id, status, lastSeen, assignedAt) => ({ id, status, lastSeen, assignedAt });
  const picked = pickDeliveryDevice([
    d('DEV-001', 'active', null, '2026-01-01T00:00:00.000Z'),
    d('DEV-002', 'disabled', '2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    d('DEV-003', 'active', '2026-05-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
    d('DEV-004', 'active', '2026-05-01T00:00:00.000Z', '2026-01-15T00:00:00.000Z'),
  ]);
  assert.equal(picked.id, 'DEV-004'); // same lastSeen as DEV-003, earlier assignment wins
  assert.equal(pickDeliveryDevice([d('DEV-009', 'lost', null, null)]), null);
});

test('cursor round-trip and limit validation', () => {
  assert.equal(decodeCursor(encodeCursor('abc_123')), 'abc_123');
  assert.throws(() => decodeCursor('%%%'), /Invalid cursor/);
  assert.throws(() => decodeCursor(Buffer.from('{"id":"../x"}').toString('base64url')), /Invalid cursor/);
  assert.equal(normalizeLimit(undefined), 20);
  assert.throws(() => normalizeLimit(0), /between 1 and 100/);
  assert.throws(() => normalizeLimit(101), /between 1 and 100/);
});
