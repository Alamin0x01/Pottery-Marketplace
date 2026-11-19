// Development helper: adds extra APPROVED products to the Firebase EMULATORS (through the same repositories and
// state transitions the real flow uses) so catalogue features such as pagination and filters can be seen.
// It REFUSES to run against a real Firebase project.
//
//   node --env-file=.env scripts/seed-catalog.js [count]     then:  npm run seed:images
import { randomUUID, createHash } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { createRepositories } from '../src/repositories/index.js';

const firebase = createFirebase(loadEnv(), { appName: 'seed-catalog' });
if (!firebase.config.useEmulators) {
  await firebase.close();
  console.error('✖ seed-catalog only runs against the Firebase emulators.');
  process.exit(2);
}

const repos = createRepositories(firebase.db);
const ACTOR = { type: 'system', id: 'seed-catalog' };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const count = Number(process.argv[2] ?? 12);

const CATALOGUE = [
  ['Glazed Terracotta Vase', 'Home Decoration', 720, 'A tall vase with a hand-applied glaze, fired in a traditional kiln.'],
  ['Clay Water Pot (Kolshi), Large', 'Kitchenware', 560, 'A large kolshi for keeping drinking water naturally cool.'],
  ['Garden Planter, Wide', 'Garden', 480, 'A wide, shallow planter for herbs and succulents.'],
  ['Earthen Tea Cups, Set of 4', 'Tableware', 360, 'Small unglazed cups for tea, shaped on the wheel.'],
  ['Storage Jar, Small', 'Storage', 290, 'A small lidded jar for spices and dry goods.'],
  ['Diya Lamp Set of 12', 'Home Decoration', 420, 'Twelve hand-pressed oil lamps for festivals.'],
  ['Earthen Curry Pot', 'Kitchenware', 640, 'A heavy-bottomed pot for slow cooking over a flame.'],
  ['Terracotta Hanging Planter', 'Garden', 540, 'A planter with a rope-friendly rim for balconies.'],
  ['Serving Bowl, Handmade', 'Tableware', 340, 'A shallow serving bowl with a rustic finish.'],
  ['Decorative Storage Jar, Large', 'Storage', 780, 'A large jar with an incised pattern around the shoulder.'],
  ['Rustic Flower Vase', 'Home Decoration', 390, 'A small, rounded vase for a few stems.'],
  ['Clay Cooking Pot, Medium', 'Kitchenware', 610, 'A medium cooking pot with two handles.'],
];

const potters = (await repos.potters.list({ status: 'active', limit: 50 })).items;
if (potters.length === 0) throw new Error('No active potters. Run seed:demo first.');
const devices = [];
for (const p of potters) devices.push((await repos.devices.listByPotter(p.id, { status: 'active' }))[0]);

let created = 0;
for (let i = 0; i < count; i += 1) {
  const [name, category, price, description] = CATALOGUE[i % CATALOGUE.length];
  const slot = i % potters.length;
  const potter = potters[slot];
  const device = devices[slot];
  if (!device) continue;
  const productId = repos.products.newId();
  await repos.uploads.createWithDraft({
    deviceId: device.id, productId, captureId: `seed-${randomUUID().slice(0, 12)}`, sizeBytes: 150_000, sha256: sha(productId),
    images: [{ path: `uploads/${potter.id}/${productId}/original.jpg`, kind: 'original', w: 1600, h: 1200 }],
  });
  await repos.products.update(productId, {
    name, category, price, stock: 2 + (i % 5), description, material: i % 3 === 0 ? 'Terracotta clay' : 'Clay', tags: ['handmade', 'traditional'],
  });
  await repos.products.transition(productId, 'pending_review', { actor: ACTOR });
  await repos.products.transition(productId, 'approved', { actor: ACTOR });
  created += 1;
}
console.log(`✔ ${created} approved products added.`);
await firebase.close();
