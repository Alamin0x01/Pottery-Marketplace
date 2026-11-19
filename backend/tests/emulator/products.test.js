import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, clearFirestore, potterWithDevice, approvedProduct, ADMIN, sha256 } from './helpers.js';

let ctx;
before(() => {
  ctx = connect('products');
});
beforeEach(clearFirestore);
after(() => ctx.firebase.close());

const upload = (repos, device, captureId, productId = repos.products.newId()) =>
  repos.uploads.createWithDraft({
    deviceId: device.id,
    productId,
    captureId,
    sizeBytes: 5000,
    sha256: sha256(captureId),
    images: [{ path: `uploads/x/${productId}/original.jpg`, kind: 'original', w: 1600, h: 1200 }],
  });

test('upload creates a draft owned by the DEVICE\'s potter, with denormalised seller fields', async () => {
  const { potter, device } = await potterWithDevice(ctx.repos);
  const { duplicate, productId } = await upload(ctx.repos, device, 'capture-0001');
  assert.equal(duplicate, false);
  const product = await ctx.repos.products.get(productId);
  assert.equal(product.potterId, potter.id);
  assert.equal(product.deviceId, device.id);
  assert.equal(product.status, 'draft');
  assert.equal(product.aiStatus, 'queued');
  assert.equal(product.price, null);
  assert.equal(product.stock, 1);
  assert.equal(product.potterName, potter.name);
  assert.equal(product.potterVillage, potter.village);
  assert.ok(!('phone' in product) && !('address' in product), 'private potter fields must not be copied');
});

test('upload is idempotent per (device, captureId), even under concurrency', async () => {
  const { device } = await potterWithDevice(ctx.repos);
  const results = await Promise.all(Array.from({ length: 8 }, () => upload(ctx.repos, device, 'capture-race1')));
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  assert.equal(new Set(results.map((r) => r.productId)).size, 1);
  assert.equal((await ctx.db.collection('products').get()).size, 1);
  assert.equal((await ctx.db.collection('uploads').get()).size, 1);

  const again = await upload(ctx.repos, device, 'capture-race1');
  assert.deepEqual(again, { duplicate: true, productId: results.find((r) => !r.duplicate).productId });
  await upload(ctx.repos, device, 'capture-other');
  assert.equal((await ctx.db.collection('products').get()).size, 2);
});

test('upload is refused for unassigned, disabled or inactive-potter devices and bad input', async () => {
  const { potter, device } = await potterWithDevice(ctx.repos);
  const loose = await ctx.repos.devices.register({ credentialHash: sha256('loose') });
  await assert.rejects(upload(ctx.repos, loose, 'capture-0002'), (e) => e.status === 403);
  await assert.rejects(upload(ctx.repos, { id: 'DEV-777' }, 'capture-0003'), (e) => e.status === 404);

  await assert.rejects(ctx.repos.uploads.createWithDraft({ deviceId: device.id, productId: 'p1', captureId: 'x', sizeBytes: 1, sha256: 'bad', images: [] }), (e) => e.status === 400);
  // A caller cannot smuggle a potterId through.
  await assert.rejects(
    ctx.repos.uploads.createWithDraft({ deviceId: device.id, productId: 'p2', captureId: 'capture-0004', sizeBytes: 1, sha256: sha256('z'), images: [{ path: 'a', kind: 'original' }], potterId: 'POT-1' }),
    (e) => e.status === 400,
  );

  await ctx.repos.potters.setStatus(potter.id, 'inactive', ADMIN);
  await assert.rejects(upload(ctx.repos, device, 'capture-0005'), (e) => e.status === 403);
  await ctx.repos.potters.setStatus(potter.id, 'active', ADMIN);
  await ctx.repos.devices.setStatus({ deviceId: device.id, status: 'disabled', actor: ADMIN });
  await assert.rejects(upload(ctx.repos, device, 'capture-0006'), (e) => e.status === 403);
  assert.equal((await ctx.db.collection('products').get()).size, 0);
});

test('status machine: approval needs a complete listing; illegal jumps are 409', async () => {
  const { device } = await potterWithDevice(ctx.repos);
  const { productId } = await upload(ctx.repos, device, 'capture-0007');

  await assert.rejects(ctx.repos.products.transition(productId, 'approved', { actor: ADMIN }), (e) => e.status === 409);
  await ctx.repos.products.transition(productId, 'pending_review', { actor: ADMIN });
  await assert.rejects(
    ctx.repos.products.transition(productId, 'approved', { actor: ADMIN }),
    (e) => e.status === 400 && e.details.map((d) => d.path).join() === 'name,description,category,price',
  );
  await ctx.repos.products.update(productId, { name: 'Clay Pot', description: 'A sturdy clay pot for cooking.', category: 'Kitchenware', price: 300 });
  const approved = await ctx.repos.products.transition(productId, 'approved', { actor: ADMIN });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedBy, ADMIN.id);
  assert.deepEqual(approved.searchTokens.sort(), ['clay', 'kitchenware', 'pot']);

  await assert.rejects(ctx.repos.products.update(productId, { price: null }), (e) => e.status === 409);
  await assert.rejects(ctx.repos.products.transition(productId, 'rejected', { actor: ADMIN, reason: 'x' }), (e) => e.status === 409);
  await ctx.repos.products.transition(productId, 'removed', { actor: ADMIN });
  await assert.rejects(ctx.repos.products.update(productId, { name: 'Edited name' }), (e) => e.status === 409);
  const actions = (await ctx.db.collection('audit_logs').get()).docs.map((d) => d.data().action).filter((a) => a.startsWith('product.'));
  assert.deepEqual(actions.sort(), ['product.approved', 'product.pending_review', 'product.removed']);
});

test('rejection requires a reason', async () => {
  const { device } = await potterWithDevice(ctx.repos);
  const { productId } = await upload(ctx.repos, device, 'capture-0008');
  await ctx.repos.products.transition(productId, 'pending_review', { actor: ADMIN });
  await assert.rejects(ctx.repos.products.transition(productId, 'rejected', { actor: ADMIN }), (e) => e.status === 400);
  const rejected = await ctx.repos.products.transition(productId, 'rejected', { actor: ADMIN, reason: 'Not pottery' });
  assert.equal(rejected.rejectionReason, 'Not pottery');
});

test('deactivating a potter suspends approved products; reactivating restores them', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const a = await approvedProduct(ctx.repos, fixture);
  const b = await approvedProduct(ctx.repos, fixture);
  const { productId: draftId } = await upload(ctx.repos, fixture.device, 'capture-0009');

  await ctx.repos.potters.setStatus(fixture.potter.id, 'inactive', ADMIN);
  assert.equal((await ctx.repos.products.list({ status: 'approved' })).items.length, 0);
  assert.equal((await ctx.repos.products.get(a.id)).status, 'suspended');
  assert.equal((await ctx.repos.products.get(a.id)).statusBeforeSuspend, 'approved');
  assert.equal((await ctx.repos.products.get(draftId)).status, 'draft');

  await ctx.repos.potters.setStatus(fixture.potter.id, 'inactive', ADMIN); // retry is harmless
  await ctx.repos.potters.setStatus(fixture.potter.id, 'active', ADMIN);
  const visible = await ctx.repos.products.list({ status: 'approved' });
  assert.deepEqual(visible.items.map((p) => p.id).sort(), [a.id, b.id].sort());
  assert.equal((await ctx.repos.products.get(a.id)).statusBeforeSuspend, null);
});

test('editing a potter refreshes the denormalised seller fields on their products', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const product = await approvedProduct(ctx.repos, fixture);
  await ctx.repos.potters.update(fixture.potter.id, { village: 'Kumartuli', district: 'Narayanganj' });
  const after = await ctx.repos.products.get(product.id);
  assert.equal(after.potterVillage, 'Kumartuli');
  assert.equal(after.potterDistrict, 'Narayanganj');
});

test('product listing: filters, price range/sort, search, pagination, and unsupported combinations', async () => {
  const fixture = await potterWithDevice(ctx.repos);
  const other = await potterWithDevice(ctx.repos);
  const cheap = await approvedProduct(ctx.repos, fixture, { price: 100, category: 'Kitchenware' });
  const mid = await approvedProduct(ctx.repos, fixture, { price: 300, category: 'Home Decoration' });
  const dear = await approvedProduct(ctx.repos, other, { price: 900, category: 'Home Decoration' });

  const ids = (r) => r.items.map((p) => p.id);
  assert.equal((await ctx.repos.products.list({ status: 'approved' })).items.length, 3);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', category: 'Kitchenware' })), [cheap.id]);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', potterId: other.potter.id })), [dear.id]);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', sort: 'price_asc' })), [cheap.id, mid.id, dear.id]);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', sort: 'price_desc' })), [dear.id, mid.id, cheap.id]);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', minPrice: 200, maxPrice: 500 })), [mid.id]);
  assert.deepEqual(ids(await ctx.repos.products.list({ status: 'approved', category: 'Home Decoration', sort: 'price_desc' })), [dear.id, mid.id]);
  assert.equal((await ctx.repos.products.list({ status: 'approved', searchToken: 'TERRACOTTA' })).items.length, 3);
  assert.equal((await ctx.repos.products.list({ status: 'approved', searchToken: 'nonexistent' })).items.length, 0);
  assert.equal((await ctx.repos.products.list({ potterId: fixture.potter.id })).items.length, 2);

  const page1 = await ctx.repos.products.list({ status: 'approved', sort: 'price_asc', limit: 2 });
  const page2 = await ctx.repos.products.list({ status: 'approved', sort: 'price_asc', limit: 2, cursor: page1.nextCursor });
  assert.deepEqual([...ids(page1), ...ids(page2)], [cheap.id, mid.id, dear.id]);
  assert.equal(page2.nextCursor, null);

  await assert.rejects(ctx.repos.products.list({ status: 'approved', category: 'Kitchenware', potterId: fixture.potter.id }), (e) => e.status === 400);
  await assert.rejects(ctx.repos.products.list({ status: 'approved', sort: 'random' }), (e) => e.status === 400);
  await assert.rejects(ctx.repos.products.list({ status: 'approved', category: 'Toys' }), (e) => e.status === 400);
  await assert.rejects(ctx.repos.products.list({ status: 'approved', cursor: 'garbage' }), (e) => e.status === 400);
});
