import { randomUUID, createHash } from 'node:crypto';
import { loadEnv } from '../../src/config/env.js';
import { createFirebase } from '../../src/config/firebase.js';
import { createRepositories } from '../../src/repositories/index.js';

export const PROJECT_ID = 'demo-pottery';
export const BUCKET = 'demo-pottery.appspot.com';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const ADMIN = { type: 'admin', id: 'adminUid1' };

/** Connects the Admin SDK to the emulators started by `npm run test:emulator`. */
export function connect(label = 'test') {
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    if (!process.env[key]) throw new Error(`${key} is not set. Run these tests with "npm run test:emulator".`);
  }
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: BUCKET,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIREBASE_STORAGE_EMULATOR_HOST: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  });
  const firebase = createFirebase(env, { appName: `${label}-${randomUUID()}` });
  return { env, firebase, repos: createRepositories(firebase.db), db: firebase.db };
}

/** Wipes all Firestore data in the emulator (emulator-only REST endpoint). */
export async function clearFirestore() {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not clear Firestore emulator: ${res.status}`);
}

// Phone numbers are unique per potter (a reservation document enforces it), so every fixture gets its own valid number.
let phoneSeq = Math.floor(Math.random() * 50_000_000);
export const uniquePhone = () => `017${String(phoneSeq++).padStart(8, '0')}`;

export const newPotter = (overrides = {}) => ({
  name: 'Rahim Uddin',
  phone: uniquePhone(),
  village: 'Pal Para',
  district: 'Dhaka',
  ...overrides,
});

/** Registers a device and assigns it to a fresh active potter. */
export async function potterWithDevice(repos, overrides = {}) {
  const potter = await repos.potters.create(newPotter(overrides), { createdBy: ADMIN.id });
  const registered = await repos.devices.register({ credentialHash: sha256(randomUUID()) });
  const device = await repos.devices.assign({ deviceId: registered.id, potterId: potter.id, actor: ADMIN });
  return { potter, device };
}

/** Creates an approved product for a potter (via the draft + admin-edit + approval path). */
export async function approvedProduct(repos, { potter, device }, { price = 450, stock = 3, category = 'Home Decoration' } = {}) {
  const productId = repos.products.newId();
  await repos.uploads.createWithDraft({
    deviceId: device.id,
    productId,
    captureId: `cap_${randomUUID().slice(0, 12)}`,
    sizeBytes: 1234,
    sha256: sha256(productId),
    images: [{ path: `uploads/${potter.id}/${productId}/original.jpg`, kind: 'original' }],
  });
  await repos.products.update(productId, {
    name: 'Handmade Terracotta Vase',
    description: 'A traditional handmade terracotta vase.',
    category,
    price,
    stock,
    tags: ['handmade', 'terracotta'],
  });
  await repos.products.transition(productId, 'pending_review', { actor: ADMIN });
  return repos.products.transition(productId, 'approved', { actor: ADMIN });
}
