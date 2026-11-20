// Gives approved products a demo image and marks a few as featured, so the storefront can be seen with data.
// Images are the static files in web/public/images/products/ (no Cloud Storage); only Firestore is written.
// Existing product records are preserved: private `original` entries are kept, and products that already have a
// web/thumb image are left alone unless you pass --all.
//
//   npm run seed:images            (Firestore emulator or a real Firestore project, per backend/.env)
//   node --env-file=.env scripts/seed-images.js --all   (re-assign images even to products that already have one)
//
// Static images are for DEMO products only. Real device photos (ESP32) will need a cloud storage solution.
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { createImagePicker, staticImageEntries } from './lib/staticImages.js';

const all = process.argv.includes('--all');
const firebase = createFirebase(loadEnv(), { appName: 'seed-images' });
const { db } = firebase;
const pick = createImagePicker();

const snapshot = await db.collection('products').where('status', '==', 'approved').get();
let assigned = 0;
let featured = 0;
let index = 0;

for (const doc of snapshot.docs) {
  const product = doc.data();
  const images = product.images ?? [];
  const patch = {};

  if (all || !images.some((i) => i.kind === 'web' || i.kind === 'thumb')) {
    patch.images = [...images.filter((i) => i.kind === 'original'), ...staticImageEntries(pick(product.name))];
    assigned += 1;
  }
  if (index < 3 && product.featured !== true) {
    patch.featured = true;
    featured += 1;
  }
  if (Object.keys(patch).length > 0) await doc.ref.update(patch);
  index += 1;
}

// Mark the first few active potters as featured so the home page has real featured potters.
const potters = await db.collection('potters').where('status', '==', 'active').get();
for (const doc of potters.docs.slice(0, 3)) {
  if (!doc.data().featured) await doc.ref.update({ featured: true, bio: doc.data().bio ?? 'Shapes and fires traditional terracotta in the village workshop.' });
}

console.log(`✔ ${assigned} products given a static demo image, ${featured} products featured (${firebase.config.useEmulators ? 'emulator' : 'REAL Firestore'}).`);
await firebase.close();
