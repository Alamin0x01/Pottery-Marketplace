// Fills the Firebase EMULATORS with realistic demo data so the admin dashboard can be seen working.
// It goes through the real repositories (same validation and rules as production code).
// It REFUSES to run against a real Firebase project.
//
//   npm run seed:demo        (emulators running, backend/.env in emulator mode)
import { randomUUID, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { createRepositories } from '../src/repositories/index.js';

const firebase = createFirebase(loadEnv(), { appName: 'seed-demo' });
if (!firebase.config.useEmulators) {
  await firebase.close();
  console.error('✖ seed:demo only runs against the Firebase emulators (it would add fake data to a real project).');
  process.exit(2);
}

const repos = createRepositories(firebase.db);
const ACTOR = { type: 'system', id: 'seed-demo' };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const hoursAgo = (h) => Timestamp.fromMillis(Date.now() - h * 3_600_000);

const POTTERS = [
  { name: 'Rahim Uddin', phone: '01711000001', village: 'Pal Para', district: 'Dhaka' },
  { name: 'Kamal Pal', phone: '01711000002', village: 'Kumartuli', district: 'Dhaka' },
  { name: 'Shila Rani Pal', phone: '01711000003', village: 'Ruhitpur', district: 'Munshiganj' },
  { name: 'Abdul Karim', phone: '01711000004', village: 'Dhamrai', district: 'Dhaka' },
];
const PRODUCTS = [
  ['Handmade Terracotta Vase', 'Home Decoration', 450], ['Clay Water Pot (Kolshi)', 'Kitchenware', 380],
  ['Decorative Diya Set of 6', 'Home Decoration', 260], ['Earthen Cooking Pot', 'Kitchenware', 520],
  ['Terracotta Garden Planter', 'Garden', 640], ['Clay Tea Cups, Set of 6', 'Tableware', 340],
  ['Storage Jar with Lid', 'Storage', 410],
];

const potters = [];
for (const p of POTTERS) potters.push(await repos.potters.create({ ...p, featured: potters.length < 2 }, { createdBy: 'seed-demo' }));

// Devices: 4 assigned (2 recently seen, 1 stale, 1 never seen), 1 unassigned, 1 disabled.
const devices = [];
for (let i = 0; i < 6; i++) devices.push(await repos.devices.register({ credentialHash: sha(`demo-${i}-${randomUUID()}`), model: 'ESP32-S3 + A7670E' }));
for (let i = 0; i < 4; i++) await repos.devices.assign({ deviceId: devices[i].id, potterId: potters[i].id, actor: ACTOR });
await repos.devices.recordSeen(devices[0].id, { batteryPct: 82, signalCsq: 21, firmwareVersion: '0.1.0' });
await repos.devices.recordSeen(devices[1].id, { batteryPct: 64, signalCsq: 17, firmwareVersion: '0.1.0' });
await firebase.db.collection('devices').doc(devices[2].id).update({ lastSeen: hoursAgo(5) });
await repos.devices.assign({ deviceId: devices[5].id, potterId: potters[3].id, actor: ACTOR });
await repos.devices.setStatus({ deviceId: devices[5].id, status: 'disabled', actor: ACTOR });

// Products: created the way the real flow does (device upload -> draft -> admin edit -> review).
async function makeProduct(i, [name, category, price], finalStatus) {
  const device = devices[i % 4];
  const productId = repos.products.newId();
  await repos.uploads.createWithDraft({
    deviceId: device.id, productId, captureId: `demo-${randomUUID().slice(0, 12)}`, sizeBytes: 180_000,
    sha256: sha(productId), images: [{ path: `uploads/demo/${productId}/original.jpg`, kind: 'original', w: 1600, h: 1200 }],
  });
  if (finalStatus === 'draft') return productId;
  await repos.products.update(productId, {
    name, category, price, stock: 3, material: 'Terracotta clay', tags: ['handmade', 'traditional'],
    description: `${name}: a traditional handmade piece shaped and fired by a village potter in Bangladesh.`,
  });
  await repos.products.transition(productId, 'pending_review', { actor: ACTOR });
  if (finalStatus === 'approved') await repos.products.transition(productId, 'approved', { actor: ACTOR });
  if (finalStatus === 'rejected') await repos.products.transition(productId, 'rejected', { actor: ACTOR, reason: 'Photo is too dark to judge' });
  return productId;
}
const plan = ['approved', 'approved', 'approved', 'approved', 'approved', 'pending_review', 'pending_review', 'draft', 'draft', 'rejected'];
const productIds = [];
for (let i = 0; i < plan.length; i++) productIds.push(await makeProduct(i, PRODUCTS[i % PRODUCTS.length], plan[i]));
const approved = productIds.filter((_, i) => plan[i] === 'approved');

// Orders spread over the last 10 days, with a realistic mix of statuses and one that needs follow-up.
const BUYERS = ['Nusrat Jahan', 'Imran Hossain', 'Farhana Akter', 'Tanvir Ahmed', 'Mitu Sultana', 'Sabbir Rahman', 'Lamia Chowdhury', 'Arif Hasan'];
const STATUSES = ['pending', 'pending', 'seller_notified', 'contacted', 'price_negotiation', 'confirmed', 'shipped', 'delivered'];
for (let i = 0; i < BUYERS.length; i++) {
  const order = await repos.orders.createWithHistory({
    productId: approved[i % approved.length], trackingTokenHash: sha(randomUUID()), idempotencyKey: `demo-${randomUUID()}`,
    buyerName: BUYERS[i], buyerPhone: `0181200000${i}`, deliveryAddress: `House ${i + 1}, Road ${i + 3}, Dhaka`, quantity: 1 + (i % 2),
  });
  const patch = { createdAt: hoursAgo(i * 29 + 2), status: STATUSES[i] };
  if (i === 2) Object.assign(patch, { needsAdminAttention: true, attentionReason: 'unacknowledged' });
  await firebase.db.collection('orders').doc(order.id).update(patch);
}
await repos.potters.setStatus(potters[3].id, 'active', ACTOR); // writes an audit entry like a real admin action

console.log(`✔ Demo data created: ${potters.length} potters, ${devices.length} devices, ${productIds.length} products, ${BUYERS.length} orders.`);
await firebase.close();
