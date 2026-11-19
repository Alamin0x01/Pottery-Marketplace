import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, clearFirestore, potterWithDevice, approvedProduct, ADMIN, sha256 } from './helpers.js';

let ctx;
before(() => {
  ctx = connect('orders');
});
beforeEach(clearFirestore);
after(() => ctx.firebase.close());

const orderInput = (productId, overrides = {}) => ({
  productId,
  trackingTokenHash: sha256(randomUUID()),
  idempotencyKey: `key-${randomUUID()}`,
  buyerName: 'Karim Ahmed',
  buyerPhone: '+8801812345678',
  deliveryAddress: 'House 1, Road 2, Dhaka',
  quantity: 1,
  ...overrides,
});

test('order copies potter, price and snapshot from the PRODUCT and records the first history row', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture, { price: 450 });
  const order = await ctx.repos.orders.createWithHistory(orderInput(product.id, { quantity: 2 }));

  assert.match(order.id, /^ORD-[A-Z2-7]{10}$/);
  assert.equal(order.potterId, fixture.potter.id);
  assert.equal(order.listedPrice, 450);
  assert.equal(order.productName, product.name);
  assert.equal(order.buyerPhone, '01812345678');
  assert.equal(order.status, 'pending');
  assert.equal(order.negotiatedPrice, null);
  assert.equal(order.customerId, null);

  const history = await ctx.repos.orders.listHistory(order.id);
  assert.equal(history.items.length, 1);
  assert.deepEqual(
    { prev: history.items[0].previousStatus, next: history.items[0].newStatus, by: history.items[0].updatedBy.type },
    { prev: null, next: 'pending', by: 'system' },
  );
});

test('order creation is refused for bad products, sellers, stock and customers; callers cannot choose the potter or price', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const other = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture, { stock: 2 });

  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput('missing_product')), (e) => e.status === 404);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id, { potterId: other.potter.id })), (e) => e.status === 400);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id, { listedPrice: 1 })), (e) => e.status === 400);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id, { quantity: 3 })), (e) => e.status === 409);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id, { customerId: 'ghost_uid' })), (e) => e.status === 400);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id, { buyerPhone: '123' })), (e) => e.status === 400);

  await ctx.repos.products.transition(product.id, 'removed', { actor: ADMIN });
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(product.id)), (e) => e.status === 404);

  const second = await approvedProduct(ctx.repos, fixture);
  await ctx.repos.potters.setStatus(fixture.potter.id, 'inactive', ADMIN);
  await assert.rejects(ctx.repos.orders.createWithHistory(orderInput(second.id)), (e) => e.status === 404); // suspended
  assert.equal((await ctx.db.collection('orders').get()).size, 0);
  assert.equal((await ctx.db.collection('order_history').get()).size, 0);
});

test('a logged-in customer is linked when the customer exists', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture);
  await ctx.repos.customers.upsert('uidCustomer1', { name: 'Karim Ahmed', phone: '01812345678' });
  const order = await ctx.repos.orders.createWithHistory(orderInput(product.id, { customerId: 'uidCustomer1' }));
  assert.equal(order.customerId, 'uidCustomer1');
  const again = await ctx.repos.customers.upsert('uidCustomer1', { name: 'Karim A.', phone: '01812345678', email: 'k@example.com' });
  assert.equal(again.email, 'k@example.com');
  assert.ok(again.createdAt);
});

test('order listing uses the declared shapes and keeps potters isolated', async () => {
  const a = await potterWithDevice(ctx.repos);
  const b = await potterWithDevice(ctx.repos);
  const pa = await approvedProduct(ctx.repos, a);
  const pb = await approvedProduct(ctx.repos, b);
  const o1 = await ctx.repos.orders.createWithHistory(orderInput(pa.id));
  await ctx.repos.orders.createWithHistory(orderInput(pa.id));
  const o3 = await ctx.repos.orders.createWithHistory(orderInput(pb.id));

  assert.equal((await ctx.repos.orders.list({ potterId: a.potter.id })).items.length, 2);
  assert.deepEqual((await ctx.repos.orders.list({ potterId: b.potter.id })).items.map((o) => o.id), [o3.id]);
  assert.equal((await ctx.repos.orders.list({ potterId: a.potter.id, status: 'pending' })).items.length, 2);
  assert.equal((await ctx.repos.orders.list({ potterId: a.potter.id, status: 'shipped' })).items.length, 0);
  assert.equal((await ctx.repos.orders.list({ status: 'pending' })).items.length, 3);
  assert.equal((await ctx.repos.orders.list({ needsAdminAttention: false })).items.length, 3);
  const page = await ctx.repos.orders.list({ potterId: a.potter.id, limit: 1 });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  assert.equal(await ctx.repos.orders.get('nope'), null);
  assert.equal((await ctx.repos.orders.get(o1.id)).id, o1.id);
  await assert.rejects(ctx.repos.orders.list({ potterId: a.potter.id, customerId: 'x' }), (e) => e.status === 400);
});

test('notifications: idempotent creation, owner-only devices, ack-by-owner only, expiry', async () => {
  const a = await potterWithDevice(ctx.repos);
  const b = await potterWithDevice(ctx.repos);
  const order = await ctx.repos.orders.createWithHistory(orderInput((await approvedProduct(ctx.repos, a)).id));

  // Another potter's device can never be the target.
  await assert.rejects(ctx.repos.notifications.create({ orderId: order.id, deviceId: b.device.id, type: 'NEW_ORDER' }), (e) => e.status === 409);
  await assert.rejects(ctx.repos.notifications.create({ orderId: 'ORD-AAAAAAAAAA', deviceId: a.device.id, type: 'NEW_ORDER' }), (e) => e.status === 404);

  const first = await ctx.repos.notifications.create({ orderId: order.id, deviceId: a.device.id, type: 'NEW_ORDER' });
  const results = await Promise.all(Array.from({ length: 6 }, () => ctx.repos.notifications.create({ orderId: order.id, deviceId: a.device.id, type: 'NEW_ORDER' })));
  assert.ok(results.every((n) => n.id === first.id));
  assert.equal((await ctx.db.collection('notifications').get()).size, 1);
  assert.equal(first.id, `${order.id}_NEW_ORDER`);
  assert.equal(first.potterId, a.potter.id);
  assert.ok(!('buyerPhone' in first) && !('buyerName' in first), 'no buyer data may be stored on a notification');

  assert.equal((await ctx.repos.notifications.listUnacknowledgedForDevice(a.device.id)).length, 1);
  assert.equal((await ctx.repos.notifications.listUnacknowledgedForDevice(b.device.id)).length, 0);

  assert.equal(await ctx.repos.notifications.acknowledge({ notificationId: first.id, deviceId: b.device.id }), null);
  assert.equal(await ctx.repos.notifications.acknowledge({ notificationId: 'nonsense', deviceId: a.device.id }), null);
  assert.equal((await ctx.repos.notifications.get(first.id)).status, 'pending');

  const acked = await ctx.repos.notifications.acknowledge({ notificationId: first.id, deviceId: a.device.id });
  assert.equal(acked.status, 'acknowledged');
  const stored = await ctx.repos.notifications.get(first.id);
  assert.ok(stored.acknowledgedAt);
  const ackedAgain = await ctx.repos.notifications.acknowledge({ notificationId: first.id, deviceId: a.device.id });
  assert.equal(ackedAgain.acknowledgedAt, stored.acknowledgedAt);
  assert.equal((await ctx.repos.notifications.listUnacknowledgedForDevice(a.device.id)).length, 0);

  // Acknowledging a notification does not change the order status (seen != accepted).
  assert.equal((await ctx.repos.orders.get(order.id)).status, 'pending');
});

test('expired notifications are not served to the device', async () => {
  const a = await potterWithDevice(ctx.repos);
  const order = await ctx.repos.orders.createWithHistory(orderInput((await approvedProduct(ctx.repos, a)).id));
  await ctx.repos.notifications.create({ orderId: order.id, deviceId: a.device.id, type: 'NEW_ORDER' }, { ttlDays: -1 });
  assert.equal((await ctx.repos.notifications.listUnacknowledgedForDevice(a.device.id)).length, 0);
});

test('admins directory upsert validates roles', async () => {
  await ctx.repos.admins.upsert('adminUidX', { name: 'Site Admin', email: 'admin@example.com', role: 'superadmin' });
  assert.equal((await ctx.repos.admins.get('adminUidX')).active, true);
  await assert.rejects(ctx.repos.admins.upsert('adminUidY', { name: 'X Admin', email: 'a@example.com', role: 'root' }), (e) => e.status === 400);
});
