// Development helper: gives the approved products in the Firebase EMULATORS a public image and marks a few as featured,
// so the storefront can be seen with data. It REFUSES to run against a real Firebase project.
// Real product photos arrive with the device upload flow (Phase 6).
//
//   npm run seed:images      (emulators running, backend/.env in emulator mode)
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { productSvg } from './lib/productArt.js';

const firebase = createFirebase(loadEnv(), { appName: 'seed-images' });
if (!firebase.config.useEmulators) {
  await firebase.close();
  console.error('✖ seed:images only runs against the Firebase emulators.');
  process.exit(2);
}

const { db, bucket } = firebase;
const snapshot = await db.collection('products').where('status', '==', 'approved').get();
let uploaded = 0;
let featured = 0;
let index = 0;

for (const doc of snapshot.docs) {
  const product = doc.data();
  const images = product.images ?? [];
  const patch = {};

  if (!images.some((i) => i.kind === 'web')) {
    const svg = Buffer.from(productSvg(product.name ?? '', index), 'utf8');
    const webPath = `public/products/${doc.id}/web.svg`;
    const thumbPath = `public/products/${doc.id}/thumb.svg`;
    for (const path of [webPath, thumbPath]) await bucket.file(path).save(svg, { contentType: 'image/svg+xml', resumable: false });
    patch.images = [
      ...images.filter((i) => i.kind === 'original'),
      { path: webPath, kind: 'web', w: 800, h: 600 },
      { path: thumbPath, kind: 'thumb', w: 800, h: 600 },
    ];
    uploaded += 1;
  }
  if (index < 3 && product.featured !== true) {
    patch.featured = true;
    featured += 1;
  }
  if (Object.keys(patch).length > 0) await doc.ref.update(patch);
  index += 1;
}

// Mark the first two potters (those with products) as featured so the home page has real featured potters.
const potters = await db.collection('potters').where('status', '==', 'active').get();
for (const doc of potters.docs.slice(0, 3)) {
  if (!doc.data().featured) await doc.ref.update({ featured: true, bio: doc.data().bio ?? 'Shapes and fires traditional terracotta in the village workshop.' });
}

console.log(`✔ ${uploaded} product images uploaded to the Storage emulator, ${featured} products featured.`);
await firebase.close();
