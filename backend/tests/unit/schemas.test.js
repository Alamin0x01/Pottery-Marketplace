import { test } from 'node:test';
import assert from 'node:assert/strict';
import { potterCreateSchema, potterUpdateSchema } from '../../src/db/schemas/potters.js';
import { deviceRegisterSchema, deviceTelemetrySchema, deviceStatusSchema } from '../../src/db/schemas/devices.js';
import { productUpdateSchema } from '../../src/db/schemas/products.js';
import { orderCreateSchema } from '../../src/db/schemas/orders.js';
import { auditEntrySchema } from '../../src/db/schemas/system.js';

const potter = { name: 'Rahim Uddin', phone: '+8801712345678', village: 'Pal Para', district: 'Dhaka' };

test('potter: normalises phone, applies defaults, rejects unknown fields', () => {
  const parsed = potterCreateSchema.parse(potter);
  assert.equal(parsed.phone, '01712345678');
  assert.equal(parsed.featured, false);
  assert.equal(parsed.address, null);
  // Ownership data can never be injected through the potter payload.
  assert.equal(potterCreateSchema.safeParse({ ...potter, deviceIds: ['DEV-001'] }).success, false);
  assert.equal(potterCreateSchema.safeParse({ ...potter, status: 'active' }).success, false);
  assert.equal(potterCreateSchema.safeParse({ ...potter, phone: '12345' }).success, false);
  assert.equal(potterUpdateSchema.safeParse({}).success, false);
});

test('text fields are trimmed and stripped of control characters', () => {
  assert.equal(potterCreateSchema.parse({ ...potter, name: '  Rahim\u0000 Uddin  ' }).name, 'Rahim Uddin');
});

test('device schemas: hash only, telemetry whitelist, no "unassigned" status', () => {
  const hash = 'a'.repeat(64);
  assert.equal(deviceRegisterSchema.parse({ credentialHash: hash }).pollIntervalSec, 300);
  assert.equal(deviceRegisterSchema.safeParse({ credentialHash: 'plain-secret' }).success, false);
  assert.equal(deviceRegisterSchema.safeParse({ credentialHash: hash, potterId: 'POT-1001' }).success, false);

  assert.equal(deviceTelemetrySchema.safeParse({ batteryPct: 80, signalCsq: 18 }).success, true);
  for (const evil of [{ potterId: 'POT-1' }, { status: 'active' }, { credentialHash: hash }, { batteryPct: 101 }]) {
    assert.equal(deviceTelemetrySchema.safeParse(evil).success, false);
  }
  assert.equal(deviceStatusSchema.safeParse('unassigned').success, false);
  assert.equal(deviceStatusSchema.safeParse('lost').success, true);
});

test('product edits cannot touch ownership, status or AI fields; prices are integers', () => {
  assert.equal(productUpdateSchema.safeParse({ price: 450, tags: ['Handmade ', 'CLAY'] }).data.tags[1], 'clay');
  for (const evil of [{ potterId: 'POT-1001' }, { status: 'approved' }, { aiStatus: 'done' }, { price: 12.5 }, { price: 0 }, { category: 'Toys' }]) {
    assert.equal(productUpdateSchema.safeParse(evil).success, false, JSON.stringify(evil));
  }
});

test('order input has no potter, price or snapshot fields', () => {
  const order = {
    productId: 'prod_1',
    trackingTokenHash: 'b'.repeat(64),
    idempotencyKey: 'key-12345678',
    buyerName: 'Karim',
    buyerPhone: '01812345678',
    deliveryAddress: 'House 1, Road 2, Dhaka',
    quantity: 1,
  };
  assert.equal(orderCreateSchema.safeParse(order).success, true);
  for (const evil of [{ potterId: 'POT-1001' }, { listedPrice: 1 }, { status: 'confirmed' }, { quantity: 0 }]) {
    assert.equal(orderCreateSchema.safeParse({ ...order, ...evil }).success, false);
  }
});

test('audit entries refuse secret-like keys', () => {
  const entry = { actor: { type: 'admin', id: 'uid1' }, action: 'device.assign', target: { collection: 'devices', id: 'DEV-001' } };
  assert.equal(auditEntrySchema.safeParse({ ...entry, after: { status: 'active' } }).success, true);
  for (const key of ['secret', 'credentialHash', 'trackingToken', 'password']) {
    assert.equal(auditEntrySchema.safeParse({ ...entry, after: { nested: { [key]: 'x' } } }).success, false, key);
  }
  assert.equal(auditEntrySchema.safeParse({ ...entry, target: { collection: 'nope', id: 'x' } }).success, false);
});
