import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect, clearFirestore, potterWithDevice, approvedProduct, ADMIN, uniquePhone } from './helpers.js';
import { emulatorSignUp, emulatorSignIn, startApi } from './authHelpers.js';
import { createAdminsService } from '../../src/services/admins.service.js';

let ctx;
let api;
const BIG = { failureLimit: 10_000, perUserLimit: 10_000, orderIpLimit: 10_000, orderPhoneLimit: 10_000, catalogCacheMs: 0 };
const PASSWORD = 'correct-horse-battery-1';

before(async () => {
  ctx = connect('marketplace');
  api = await startApi(ctx, { failureLimit: 10_000, perAdminLimit: 10_000 }, {}, undefined, BIG);
});
beforeEach(clearFirestore);
after(async () => {
  await api.close();
  await ctx.firebase.close();
});

const email = (tag) => `${tag}-${randomUUID().slice(0, 8)}@example.com`;
/** A browser sign-up: a Firebase user with NO role and NO profile yet. */
async function newUser(tag = 'cust') {
  const address = email(tag);
  const { idToken, localId } = await emulatorSignUp(address, PASSWORD);
  return { email: address, uid: localId, token: idToken };
}
async function customer(tag = 'cust') {
  const user = await newUser(tag);
  const res = await api.call('PATCH', '/api/customers/me', { token: user.token, body: { name: 'Karim Ahmed', phone: uniquePhone() } });
  assert.equal(res.status, 200, res.text);
  return { ...user, profile: res.body.customer };
}

const DISTRICT = 'Dhaka';
const orderBody = (productId, overrides = {}) => ({
  productId,
  quantity: 1,
  buyerName: 'Karim Ahmed',
  buyerPhone: uniquePhone(),
  deliveryAddress: 'House 12, Road 4, Dhanmondi',
  deliveryDistrict: DISTRICT,
  ...overrides,
});
const placeOrder = (body, { key = `key-${randomUUID()}`, token, headers = {} } = {}) =>
  api.call('POST', '/api/orders', { token, headers: { 'idempotency-key': key, ...headers }, body });
const stockOf = async (id) => (await ctx.db.collection('products').doc(id).get()).data().stock;

async function shop(overrides = {}) {
  const fixture = await potterWithDevice(ctx.repos, overrides);
  return fixture;
}
async function product(fx, { name = 'Handmade Terracotta Vase', stock = 3, ...opts } = {}) {
  // Approval requires stock >= 1, so a sold-out product is approved first and then sells its last unit.
  const p = await approvedProduct(ctx.repos, fx, { ...opts, stock: Math.max(stock, 1) });
  if (stock === 0) await ctx.db.collection('products').doc(p.id).update({ stock: 0 });
  return name === p.name ? p : ctx.repos.products.update(p.id, { name });
}

// ---------------------------------------------------------------------------------------------------------------
// 1-2. Customer registration, login, profile, addresses
// ---------------------------------------------------------------------------------------------------------------

test('1. registration: a new Firebase user becomes a customer by saving a profile; email comes from the token, never the body', async () => {
  const user = await newUser();
  const before = await api.call('GET', '/api/customers/me', { token: user.token });
  assert.equal(before.status, 200);
  assert.equal(before.body.customer, null, 'signed up but no profile yet');
  assert.equal(before.body.email, user.email);

  for (const body of [{}, { name: 'Karim Ahmed' }, { phone: '01712345678' }, { name: 'K', phone: '01712345678' }, { name: 'Karim Ahmed', phone: '12345' }, { name: 'Karim Ahmed', phone: '01712345678', email: 'evil@example.com' }, { name: 'Karim Ahmed', phone: '01712345678', role: 'admin' }]) {
    assert.equal((await api.call('PATCH', '/api/customers/me', { token: user.token, body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await ctx.db.collection('customers').get()).size, 0, 'rejected requests create nothing');

  const created = await api.call('PATCH', '/api/customers/me', { token: user.token, body: { name: 'Karim Ahmed', phone: '+880 1712-345678' } });
  assert.equal(created.status, 200);
  assert.deepEqual(
    { name: created.body.customer.name, phone: created.body.customer.phone, email: created.body.customer.email, addresses: created.body.customer.addresses },
    { name: 'Karim Ahmed', phone: '01712345678', email: user.email, addresses: [] },
  );
  assert.equal(created.body.customer.id, user.uid);

  const edited = await api.call('PATCH', '/api/customers/me', { token: user.token, body: { name: 'Karim A. Ahmed' } });
  assert.equal(edited.body.customer.name, 'Karim A. Ahmed');
  assert.equal(edited.body.customer.phone, '01712345678');
});

test('2. login: a customer signs in again and gets a fresh token that reads the same profile', async () => {
  const c = await customer();
  const token = await emulatorSignIn(c.email, PASSWORD);
  const me = await api.call('GET', '/api/customers/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.customer.id, c.uid);
  assert.equal(me.body.uid, c.uid);
  await assert.rejects(emulatorSignIn(c.email, 'wrong-password-1'), /INVALID|PASSWORD/i);
});

test('13. unauthorized access: no/garbage/forged tokens are 401; a customer can never use admin APIs', async () => {
  const c = await customer();
  for (const [method, path] of [['GET', '/api/customers/me'], ['PATCH', '/api/customers/me'], ['GET', '/api/customers/me/orders'], ['POST', '/api/customers/me/addresses'], ['DELETE', '/api/customers/me/addresses/abcdef123456']]) {
    assert.equal((await api.call(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} })).status, 401, `${method} ${path} without token`);
    assert.equal((await api.call(method, path, { token: 'garbage', body: method === 'GET' || method === 'DELETE' ? undefined : {} })).status, 401, `${method} ${path} garbage`);
  }
  for (const path of ['/api/admin/me', '/api/admin/dashboard', '/api/admin/potters', '/api/admin/devices', '/api/admin/orders']) {
    assert.equal((await api.call('GET', path, { token: c.token })).status, 403, path);
  }
  assert.equal((await api.call('POST', '/api/admin/potters', { token: c.token, body: {} })).status, 403);
  // A claim-less user cannot grant themselves a role through the profile endpoint.
  const me = await api.call('GET', '/api/admin/me', { token: await emulatorSignIn(c.email, PASSWORD) });
  assert.equal(me.status, 403);
});

test('2b. addresses: add, default handling, update, delete, limit; every change is scoped to the caller', async () => {
  const a = await customer('a');
  const b = await customer('b');
  const addr = (overrides = {}) => ({ label: 'Home', recipientName: 'Karim Ahmed', phone: '01712345678', line: 'House 12, Road 4, Dhanmondi', district: 'comilla', ...overrides });

  const first = await api.call('POST', '/api/customers/me/addresses', { token: a.token, body: addr() });
  assert.equal(first.status, 201);
  assert.equal(first.body.addresses.length, 1);
  assert.equal(first.body.addresses[0].isDefault, true, 'the first address is the default');
  assert.equal(first.body.addresses[0].district, 'Cumilla', 'district is canonicalised');
  const firstId = first.body.addresses[0].id;

  const second = await api.call('POST', '/api/customers/me/addresses', { token: a.token, body: addr({ label: 'Work', district: 'Dhaka', isDefault: true }) });
  assert.equal(second.body.addresses.filter((x) => x.isDefault).length, 1);
  assert.equal(second.body.addresses.find((x) => x.label === 'Work').isDefault, true);

  const patched = await api.call('PATCH', `/api/customers/me/addresses/${firstId}`, { token: a.token, body: { label: 'Parents', isDefault: true } });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body.addresses.filter((x) => x.isDefault).map((x) => x.id), [firstId]);

  for (const body of [addr({ line: 'short' }), addr({ district: 'Atlantis' }), addr({ phone: '1' }), { ...addr(), id: 'hack' }, {}]) {
    assert.equal((await api.call('POST', '/api/customers/me/addresses', { token: a.token, body })).status, 400, JSON.stringify(body));
  }

  // B cannot see or touch A's addresses.
  const bMe = await api.call('GET', '/api/customers/me', { token: b.token });
  assert.deepEqual(bMe.body.customer.addresses, []);
  assert.equal((await api.call('PATCH', `/api/customers/me/addresses/${firstId}`, { token: b.token, body: { label: 'Hacked' } })).status, 404);
  assert.equal((await api.call('DELETE', `/api/customers/me/addresses/${firstId}`, { token: b.token })).status, 404);

  const removed = await api.call('DELETE', `/api/customers/me/addresses/${firstId}`, { token: a.token });
  assert.equal(removed.body.addresses.length, 1);
  assert.equal(removed.body.addresses[0].isDefault, true, 'a default always exists while addresses remain');

  for (let i = 0; i < 4; i += 1) assert.equal((await api.call('POST', '/api/customers/me/addresses', { token: a.token, body: addr({ label: `Extra ${i}` }) })).status, 201);
  const over = await api.call('POST', '/api/customers/me/addresses', { token: a.token, body: addr({ label: 'Too many' }) });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'ADDRESS_LIMIT');

  const noProfile = await newUser('np');
  const res = await api.call('POST', '/api/customers/me/addresses', { token: noProfile.token, body: addr() });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PROFILE_REQUIRED');
});

// ---------------------------------------------------------------------------------------------------------------
// 3-5. Catalogue
// ---------------------------------------------------------------------------------------------------------------

test('3. product listing shows only approved, in-stock products with an allow-listed payload', async () => {
  const fx = await shop();
  const visible = await product(fx, { price: 450, stock: 3 });
  const soldOut = await product(fx, { price: 300, stock: 0 });
  const draftId = ctx.repos.products.newId();
  await ctx.repos.uploads.createWithDraft({
    deviceId: fx.device.id, productId: draftId, captureId: `cap_${randomUUID().slice(0, 12)}`, sizeBytes: 10, sha256: 'a'.repeat(64),
    images: [{ path: `uploads/${fx.potter.id}/${draftId}/original.jpg`, kind: 'original' }],
  });
  const pending = await approvedProduct(ctx.repos, fx);
  await ctx.repos.products.transition(pending.id, 'pending_review', { actor: ADMIN });
  const other = await shop();
  const suspended = await approvedProduct(ctx.repos, other);
  await ctx.repos.potters.setStatus(other.potter.id, 'inactive', ADMIN);
  assert.equal((await ctx.repos.products.get(suspended.id)).status, 'suspended');

  const res = await api.call('GET', '/api/products');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((p) => p.id), [visible.id]);
  assert.ok(!res.body.items.some((p) => p.id === soldOut.id), 'sold-out products are not offered');

  const item = res.body.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['available', 'category', 'createdAt', 'description', 'featured', 'id', 'imageUrl', 'material', 'name', 'price', 'seller', 'stock', 'tags', 'thumbUrl'].sort());
  assert.deepEqual(Object.keys(item.seller).sort(), ['district', 'name', 'village']);
  assert.equal(item.available, true);
  const raw = res.text;
  for (const secret of [fx.potter.id, fx.device.id, 'potterId', 'deviceId', 'aiStatus', 'searchTokens', 'original.jpg', fx.potter.phone]) {
    assert.ok(!raw.includes(secret), `public payload must not contain ${secret}`);
  }
});

test('4. filtering, price filter, sorting, search and pagination', async () => {
  const fx = await shop();
  const fx2 = await shop({ village: 'Dhamrai' });
  const make = async (name, category, price, f = fx) => (await ctx.repos.products.update((await approvedProduct(ctx.repos, f, { category, price })).id, { name }));
  const vase = await make('Blue Glazed Vase', 'Home Decoration', 900);
  const pot = await make('Clay Cooking Pot', 'Kitchenware', 450);
  const planter = await make('Garden Planter', 'Garden', 650, fx2);
  const cups = await make('Tea Cups Set', 'Tableware', 300);
  const jar = await make('Storage Jar', 'Storage', 500, fx2);
  const ids = async (qs) => {
    const res = await api.call('GET', `/api/products${qs}`);
    assert.equal(res.status, 200, `${qs}: ${res.text}`);
    return res.body.items.map((p) => p.id);
  };

  assert.equal((await ids('')).length, 5);
  assert.deepEqual(await ids('?category=Kitchenware'), [pot.id]);
  assert.deepEqual(await ids('?sort=price_asc'), [cups.id, pot.id, jar.id, planter.id, vase.id]);
  assert.deepEqual(await ids('?sort=price_desc'), [vase.id, planter.id, jar.id, pot.id, cups.id]);
  assert.deepEqual(await ids('?minPrice=400&maxPrice=700&sort=price_asc'), [pot.id, jar.id, planter.id]);
  assert.deepEqual(await ids('?minPrice=400&maxPrice=700'), [jar.id, planter.id, pot.id], 'price range with the default "newest" order');
  assert.deepEqual(await ids('?minPrice=800'), [vase.id]);
  assert.deepEqual(await ids('?category=Garden&sort=price_desc&maxPrice=1000'), [planter.id]);
  assert.deepEqual(await ids('?q=vase'), [vase.id]);
  assert.deepEqual(await ids('?q=clay%20pot'), [pot.id]);
  assert.deepEqual(await ids('?q=garden'), [planter.id], 'category words are searchable');
  assert.deepEqual(await ids('?q=planter&category=Garden&minPrice=600&sort=price_asc'), [planter.id]);
  assert.deepEqual(await ids('?q=nothingmatches'), []);
  assert.deepEqual(await ids(`?potterId=${fx2.potter.id}`), [jar.id, planter.id]);
  assert.deepEqual(await ids('?q=zz'), []);

  const walk = async (qs) => {
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const res = await api.call('GET', `/api/products?limit=2${qs}${cursor ? `&cursor=${cursor}` : ''}`);
      assert.equal(res.status, 200, res.text);
      assert.ok(res.body.items.length <= 2);
      seen.push(...res.body.items.map((p) => p.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    return seen;
  };
  assert.equal(new Set(await walk('')).size, 5);
  assert.deepEqual(await walk('&sort=price_asc'), [cups.id, pot.id, jar.id, planter.id, vase.id]);
  assert.deepEqual(await walk('&minPrice=400&maxPrice=700'), [jar.id, planter.id, pot.id]);
  assert.equal((await walk(`&potterId=${fx.potter.id}`)).length, 3);

  for (const qs of ['?minPrice=900&maxPrice=100', '?sort=random', '?category=Cars', '?limit=0', '?limit=500', '?bogus=1', '?cursor=@@@', '?minPrice=-5', '?potterId=nope']) {
    assert.equal((await api.call('GET', `/api/products${qs}`)).status, 400, qs);
  }
});

test('4b. sold-out products stay hidden but the listing still fills the page; featured filter works', async () => {
  const fx = await shop();
  const live = [];
  for (let i = 0; i < 3; i += 1) live.push(await product(fx, { stock: 2 }));
  for (let i = 0; i < 4; i += 1) await product(fx, { stock: 0 });
  const res = await api.call('GET', '/api/products?limit=3');
  assert.equal(res.body.items.length, 3, 'not shortened by hidden sold-out items');
  assert.deepEqual(new Set(res.body.items.map((p) => p.id)), new Set(live.map((p) => p.id)));
  assert.equal((await api.call('GET', '/api/products?featured=true')).body.items.length, 0);
  await ctx.repos.products.update(live[0].id, { featured: true });
  assert.deepEqual((await api.call('GET', '/api/products?featured=true')).body.items.map((p) => p.id), [live[0].id]);
});

test('5. product details: approved only; unknown fields hidden; sold-out shown as unavailable; images use public paths only', async () => {
  const fx = await shop({ village: 'Pal Para', district: 'Dhaka' });
  const p = await product(fx, { price: 450, stock: 2 });
  await ctx.db.collection('products').doc(p.id).update({
    material: 'Terracotta clay',
    images: [
      { path: `uploads/${fx.potter.id}/${p.id}/original.jpg`, kind: 'original', w: null, h: null },
      { path: `public/products/${p.id}/web.jpg`, kind: 'web', w: 1200, h: 900 },
      { path: `public/products/${p.id}/thumb.jpg`, kind: 'thumb', w: 400, h: 300 },
    ],
  });
  const res = await api.call('GET', `/api/products/${p.id}`);
  assert.equal(res.status, 200);
  const d = res.body.product;
  assert.equal(d.name, 'Handmade Terracotta Vase');
  assert.equal(d.price, 450);
  assert.equal(d.material, 'Terracotta clay');
  assert.deepEqual(d.seller, { name: fx.potter.name, village: 'Pal Para', district: 'Dhaka' });
  assert.match(d.imageUrl, new RegExp(`/o/public%2Fproducts%2F${p.id}%2Fweb\\.jpg\\?alt=media$`));
  assert.match(d.thumbUrl, /thumb\.jpg/);
  assert.ok(!res.text.includes('original.jpg') && !res.text.includes(fx.potter.id));

  await ctx.db.collection('products').doc(p.id).update({ material: 'unknown' });
  assert.equal((await api.call('GET', `/api/products/${p.id}`)).body.product.material, null, '"unknown" is not invented as a specification');

  await ctx.db.collection('products').doc(p.id).update({ stock: 0 });
  const soldOut = await api.call('GET', `/api/products/${p.id}`);
  assert.equal(soldOut.status, 200);
  assert.equal(soldOut.body.product.available, false);

  for (const status of ['removed', 'pending_review', 'draft', 'rejected', 'suspended']) {
    await ctx.db.collection('products').doc(p.id).update({ status });
    assert.equal((await api.call('GET', `/api/products/${p.id}`)).status, 404, status);
  }
  assert.equal((await api.call('GET', '/api/products/does-not-exist')).status, 404);
  assert.equal((await api.call('GET', '/api/products/bad%20id')).status, 400);
});

test('categories and featured potters come from real approved products', async () => {
  const fx = await shop();
  const fx2 = await shop();
  await ctx.repos.potters.update(fx.potter.id, { featured: true, bio: 'Third-generation potter' });
  await ctx.repos.potters.update(fx2.potter.id, { featured: true });
  await product(fx, { category: 'Garden' });
  await product(fx, { category: 'Garden' });
  await product(fx, { category: 'Kitchenware' });

  const cats = await api.call('GET', '/api/categories');
  const byName = Object.fromEntries(cats.body.items.map((c) => [c.name, c.count]));
  assert.equal(byName.Garden, 2);
  assert.equal(byName.Kitchenware, 1);
  assert.equal(byName.Tableware, 0);
  assert.equal(cats.body.items[0].name, 'Garden', 'most popular first');

  const potters = await api.call('GET', '/api/potters/featured');
  assert.deepEqual(potters.body.items.map((p) => p.id), [fx.potter.id], 'featured potters without approved products are not shown');
  assert.deepEqual(Object.keys(potters.body.items[0]).sort(), ['bio', 'district', 'id', 'name', 'productCount', 'village']);
  assert.ok(!potters.text.includes(fx.potter.phone) && !potters.text.includes('address'));
});

// ---------------------------------------------------------------------------------------------------------------
// 7-10. Orders
// ---------------------------------------------------------------------------------------------------------------

test('7. guest checkout creates the order for the PRODUCT\'s potter, reserves stock and records history', async () => {
  const fx = await shop();
  const other = await shop();
  const p = await product(fx, { price: 450, stock: 5 });
  const body = orderBody(p.id, { quantity: 2, buyerPhone: '+880 1812-345678' });
  const res = await placeOrder(body);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.body.orderId, /^ORD-[A-Z2-7]{10}$/);
  assert.equal(res.body.status, 'pending');
  assert.ok(res.body.trackingToken.length >= 32);

  const stored = (await ctx.db.collection('orders').doc(res.body.orderId).get()).data();
  assert.equal(stored.potterId, fx.potter.id, 'potter is taken from the product record');
  assert.notEqual(stored.potterId, other.potter.id);
  assert.equal(stored.listedPrice, 450);
  assert.equal(stored.quantity, 2);
  assert.equal(stored.buyerPhone, '01812345678');
  assert.equal(stored.deliveryDistrict, 'Dhaka');
  assert.equal(stored.customerId, null);
  assert.equal(stored.status, 'pending');
  assert.notEqual(stored.trackingTokenHash, res.body.trackingToken, 'only a hash of the token is stored');
  assert.ok(!JSON.stringify(stored).includes(res.body.trackingToken));
  assert.equal(await stockOf(p.id), 3, 'two units reserved');
  assert.equal((await ctx.db.collection('order_history').where('orderId', '==', res.body.orderId).get()).size, 1);
  // The order is ready for the Phase 9 notification system: pending, with potter and buyer snapshot.
  assert.equal((await ctx.db.collection('notifications').get()).size, 0);
});

test('8. checkout validation and the order is never accepted blindly', async () => {
  const fx = await shop();
  const other = await shop();
  const p = await product(fx, { price: 450, stock: 2 });
  const bad = [
    [{ buyerPhone: '12345' }, 400], [{ buyerPhone: '02712345678' }, 400], [{ buyerName: 'x' }, 400], [{ deliveryAddress: 'short' }, 400],
    [{ deliveryDistrict: 'Atlantis' }, 400], [{ deliveryDistrict: undefined }, 400], [{ quantity: 0 }, 400], [{ quantity: 1.5 }, 400], [{ quantity: 51 }, 400], [{ quantity: '1' }, 400],
    [{ potterId: other.potter.id }, 400], [{ listedPrice: 1 }, 400], [{ price: 1 }, 400], [{ status: 'confirmed' }, 400], [{ customerId: 'someoneElse' }, 400],
    [{ productId: 'missing_product' }, 404], [{ quantity: 3 }, 409],
  ];
  for (const [overrides, status] of bad) {
    const body = orderBody(p.id, overrides);
    for (const k of Object.keys(overrides)) if (overrides[k] === undefined) delete body[k];
    const res = await placeOrder(body);
    assert.equal(res.status, status, `${JSON.stringify(overrides)} -> ${res.text}`);
  }
  const noKey = await api.call('POST', '/api/orders', { body: orderBody(p.id) });
  assert.equal(noKey.status, 400);
  const shortKey = await placeOrder(orderBody(p.id), { key: 'abc' });
  assert.equal(shortKey.status, 400);
  assert.equal((await ctx.db.collection('orders').get()).size, 0, 'no failed attempt created an order');
  assert.equal(await stockOf(p.id), 2, 'no failed attempt touched the stock');

  for (const status of ['pending_review', 'removed', 'suspended']) {
    await ctx.db.collection('products').doc(p.id).update({ status });
    assert.equal((await placeOrder(orderBody(p.id))).status, 404, status);
  }
  await ctx.db.collection('products').doc(p.id).update({ status: 'approved' });
  await ctx.db.collection('potters').doc(fx.potter.id).update({ status: 'inactive' });
  assert.equal((await placeOrder(orderBody(p.id))).status, 409, 'inactive seller');
});

test('9. duplicate prevention: replay with the same key is safe; a second order for the same product within minutes is refused', async () => {
  const fx = await shop();
  const p = await product(fx, { price: 450, stock: 5 });
  const body = orderBody(p.id);
  const key = `key-${randomUUID()}`;
  const first = await placeOrder(body, { key });
  assert.equal(first.status, 201);

  const replay = await placeOrder(body, { key });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.orderId, first.body.orderId);
  assert.equal(replay.body.replayed, true);
  assert.notEqual(replay.body.trackingToken, first.body.trackingToken, 'a fresh tracking token is issued on replay');
  assert.equal((await ctx.db.collection('orders').get()).size, 1);
  assert.equal(await stockOf(p.id), 4, 'stock is reserved once');
  assert.equal((await api.call('GET', `/api/orders/${first.body.orderId}`, { headers: { 'x-tracking-token': first.body.trackingToken } })).status, 404, 'the superseded token stops working');
  assert.equal((await api.call('GET', `/api/orders/${first.body.orderId}`, { headers: { 'x-tracking-token': replay.body.trackingToken } })).status, 200);

  const mismatch = await placeOrder({ ...body, quantity: 2 }, { key });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error.code, 'IDEMPOTENCY_MISMATCH');

  const burst = await Promise.all(Array.from({ length: 6 }, () => placeOrder({ ...body, buyerPhone: '01911112222' }, { key: 'burst-key-0001' })));
  assert.equal(new Set(burst.map((r) => r.body.orderId)).size, 1, 'concurrent identical requests produce ONE order');
  assert.ok(burst.every((r) => [200, 201].includes(r.status)));
  assert.equal((await ctx.db.collection('orders').get()).size, 2);
  assert.equal(await stockOf(p.id), 3);

  const dup = await placeOrder(body, { key: `other-${randomUUID()}` });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'DUPLICATE_ORDER');
  const differentPhone = await placeOrder({ ...body, buyerPhone: '01822223333' });
  assert.equal(differentPhone.status, 201, 'other buyers are unaffected');
  assert.equal(await stockOf(p.id), 2);

  // After the earlier order is cancelled the buyer may order again, and the stock comes back.
  await ctx.repos.orders.cancel(first.body.orderId, { actor: ADMIN, note: 'buyer asked' });
  assert.equal(await stockOf(p.id), 3);
  assert.equal((await placeOrder(body, { key: `again-${randomUUID()}` })).status, 201);
});

test('10. stock: concurrent buyers can never oversell; sold-out products leave the shop; cancellation returns units', async () => {
  const fx = await shop();
  const p = await product(fx, { price: 450, stock: 3 });
  const results = await Promise.all(Array.from({ length: 8 }, () => placeOrder(orderBody(p.id))));
  assert.equal(results.filter((r) => r.status === 201).length, 3);
  const refused = results.filter((r) => r.status === 409);
  assert.equal(refused.length, 5);
  assert.ok(refused.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK'));
  assert.equal(await stockOf(p.id), 0);
  assert.equal((await ctx.db.collection('orders').get()).size, 3);

  assert.equal((await api.call('GET', '/api/products')).body.items.length, 0);
  const detail = await api.call('GET', `/api/products/${p.id}`);
  assert.equal(detail.body.product.available, false);
  assert.equal(detail.body.product.stock, 0);

  const orderId = results.find((r) => r.status === 201).body.orderId;
  await ctx.repos.orders.cancel(orderId, { actor: ADMIN });
  assert.equal(await stockOf(p.id), 1);
  assert.equal((await api.call('GET', '/api/products')).body.items.length, 1);
  await assert.rejects(ctx.repos.orders.cancel(orderId, { actor: ADMIN }), (e) => e.status === 409, 'cancelling twice cannot restore stock twice');
  assert.equal(await stockOf(p.id), 1);

  const few = await product(fx, { stock: 2 });
  const tooMany = await placeOrder(orderBody(few.id, { quantity: 3 }));
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.body.error.message, /Only 2 left/);
});

test('11. a signed-in customer\'s order is linked to them, appears in their history and cannot be read by others', async () => {
  const fx = await shop();
  const p = await product(fx, { price: 450, stock: 10 });
  const alice = await customer('alice');
  const bob = await customer('bob');
  const guestPhone = uniquePhone();

  const a1 = await placeOrder(orderBody(p.id, { quantity: 2 }), { token: alice.token });
  const a2 = await placeOrder(orderBody(p.id), { token: alice.token });
  const b1 = await placeOrder(orderBody(p.id), { token: bob.token });
  const g1 = await placeOrder(orderBody(p.id, { buyerPhone: guestPhone }));
  for (const r of [a1, a2, b1, g1]) assert.equal(r.status, 201, r.text);
  assert.equal((await ctx.db.collection('orders').doc(a1.body.orderId).get()).data().customerId, alice.uid, 'customerId comes from the verified token');

  const mine = await api.call('GET', '/api/customers/me/orders', { token: alice.token });
  assert.equal(mine.status, 200);
  assert.deepEqual(new Set(mine.body.items.map((o) => o.id)), new Set([a1.body.orderId, a2.body.orderId]));
  const view = mine.body.items.find((o) => o.id === a1.body.orderId);
  assert.deepEqual(Object.keys(view).sort(), ['courierName', 'createdAt', 'delivery', 'id', 'listedPrice', 'negotiatedPrice', 'productId', 'productImageUrl', 'productName', 'quantity', 'status', 'trackingNumber', 'updatedAt'].sort());
  assert.equal(view.quantity, 2);
  assert.equal(view.listedPrice, 450);
  assert.equal(view.negotiatedPrice, null);
  assert.equal(view.delivery.district, 'Dhaka');
  for (const leaked of ['potterId', 'trackingTokenHash', 'idempotencyKey', 'needsAdminAttention', fx.potter.id, fx.potter.phone]) assert.ok(!mine.text.includes(leaked), leaked);
  assert.deepEqual((await api.call('GET', '/api/customers/me/orders', { token: bob.token })).body.items.map((o) => o.id), [b1.body.orderId]);

  const page = await api.call('GET', '/api/customers/me/orders?limit=1', { token: alice.token });
  assert.equal(page.body.items.length, 1);
  assert.ok(page.body.nextCursor);
  assert.equal((await api.call('GET', `/api/customers/me/orders?limit=1&cursor=${page.body.nextCursor}`, { token: alice.token })).body.items.length, 1);

  // Isolation: Bob and anonymous callers get 404 (not 403) for Alice's order.
  const url = `/api/orders/${a1.body.orderId}`;
  assert.equal((await api.call('GET', url, { token: alice.token })).status, 200);
  assert.equal((await api.call('GET', url, { token: bob.token })).status, 404);
  assert.equal((await api.call('GET', url)).status, 404);
  assert.equal((await api.call('GET', url, { token: bob.token, headers: { 'x-tracking-token': 'x'.repeat(32) } })).status, 404);
  assert.equal((await api.call('GET', url, { token: 'garbage' })).status, 401, 'a present-but-invalid token is never treated as a guest');
  assert.equal((await api.call('GET', '/api/orders/ORD-AAAAAAAAAA')).status, 404);
  assert.equal((await api.call('GET', '/api/orders/nonsense')).status, 400);
  // Guest orders are not linked to anyone's history.
  assert.ok(![...mine.body.items, ...(await api.call('GET', '/api/customers/me/orders', { token: bob.token })).body.items].some((o) => o.id === g1.body.orderId));
});

test('12. tracking token access: guest can follow their order with masked contact details and a status timeline', async () => {
  const fx = await shop();
  const p = await product(fx, { price: 450, stock: 5 });
  const phone = '01712349999';
  const res = await placeOrder(orderBody(p.id, { buyerPhone: phone }));
  const orderId = res.body.orderId;

  const view = await api.call('GET', `/api/orders/${orderId}`, { headers: { 'x-tracking-token': res.body.trackingToken } });
  assert.equal(view.status, 200);
  const order = view.body.order;
  assert.equal(order.status, 'pending');
  assert.equal(order.productName, p.name);
  assert.equal(order.delivery.phone, '01*******99', 'token holders get a masked phone');
  assert.ok(!view.text.includes(phone));
  assert.deepEqual(order.timeline.map((t) => t.status), ['pending']);

  // Status changes (admin flow lands in Phase 7) are reflected in the timeline and prices.
  await ctx.db.collection('orders').doc(orderId).update({ status: 'price_negotiation', negotiatedPrice: 420 });
  await ctx.db.collection('order_history').add({ orderId, previousStatus: 'pending', newStatus: 'price_negotiation', previousPrice: null, negotiatedPrice: 420, note: 'internal note must stay private', updatedBy: ADMIN, timestamp: new Date() });
  const after = await api.call('GET', `/api/orders/${orderId}`, { headers: { 'x-tracking-token': res.body.trackingToken } });
  assert.equal(after.body.order.status, 'price_negotiation');
  assert.equal(after.body.order.negotiatedPrice, 420);
  assert.equal(after.body.order.listedPrice, 450);
  assert.deepEqual(after.body.order.timeline.map((t) => t.status), ['pending', 'price_negotiation']);
  assert.ok(!after.text.includes('internal note') && !after.text.includes(ADMIN.id));

  for (const status of ['seller_notified', 'contacted', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']) {
    await ctx.db.collection('orders').doc(orderId).update({ status });
    assert.equal((await api.call('GET', `/api/orders/${orderId}`, { headers: { 'x-tracking-token': res.body.trackingToken } })).body.order.status, status);
  }
});

test('an admin can read any order through the same endpoint; a signed-in user without a profile cannot order', async () => {
  const admins = createAdminsService({ auth: ctx.firebase.auth, repos: ctx.repos });
  const adminEmail = email('adm');
  const { localId } = await emulatorSignUp(adminEmail, PASSWORD);
  await admins.grant({ email: adminEmail, name: 'Test Admin', role: 'admin' });
  const adminToken = await emulatorSignIn(adminEmail, PASSWORD);
  assert.ok(localId);

  const fx = await shop();
  const p = await product(fx, { stock: 5 });
  const g = await placeOrder(orderBody(p.id));
  assert.equal((await api.call('GET', `/api/orders/${g.body.orderId}`, { token: adminToken })).status, 200);

  const noProfile = await newUser('np');
  const res = await placeOrder(orderBody(p.id), { token: noProfile.token });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'PROFILE_REQUIRED');
  assert.equal(await stockOf(p.id), 4);
});

test('order placement is rate limited per IP and per phone', async () => {
  const strict = await startApi(ctx, {}, {}, undefined, { orderIpLimit: 3, orderPhoneLimit: 2, failureLimit: 10_000 });
  try {
    const fx = await shop();
    const p = await product(fx, { stock: 20 });
    const call = (body) => strict.call('POST', '/api/orders', { headers: { 'idempotency-key': `key-${randomUUID()}` }, body });
    const phone = uniquePhone();
    assert.equal((await call(orderBody(p.id, { buyerPhone: phone }))).status, 201);
    assert.equal((await call(orderBody(p.id, { buyerPhone: phone }))).status, 409, 'duplicate guard answers before the phone limit is hit');
    assert.equal((await call(orderBody(p.id, { buyerPhone: phone }))).status, 429, 'third request from one phone');
    const limited = await call(orderBody(p.id));
    assert.equal(limited.status, 429, 'fourth request from one IP');
    assert.ok(limited.headers.get('retry-after') || limited.headers.get('ratelimit'));
  } finally {
    await strict.close();
  }
});

test('public endpoints never leak through odd inputs, and responses carry a request id', async () => {
  const res = await api.call('GET', '/api/products?q=%27%20OR%201%3D1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items, []);
  assert.ok(res.headers.get('x-request-id'));
  assert.equal((await api.call('GET', '/api/products/..%2F..%2Fadmin')).status, 400);
  assert.equal((await api.call('POST', '/api/products', { body: {} })).status, 404, 'the catalogue is read-only');
});
