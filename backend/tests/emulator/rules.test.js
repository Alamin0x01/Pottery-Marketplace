import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, getBytes, uploadBytes, deleteObject } from 'firebase/storage';
import { COLLECTIONS } from '../../src/db/collections.js';
import { PROJECT_ID } from './helpers.js';

const rules = (file) => readFileSync(new URL(`../../firebase/${file}`, import.meta.url), 'utf8');
const hostPort = (value) => {
  const [host, port] = value.split(':');
  return { host, port: Number(port) };
};

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rules('firestore.rules'), ...hostPort(process.env.FIRESTORE_EMULATOR_HOST) },
    storage: { rules: rules('storage.rules'), ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST) },
  });
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    for (const name of Object.values(COLLECTIONS)) await setDoc(doc(admin.firestore(), name, 'seed'), { seeded: true });
    const storage = admin.storage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    await uploadBytes(ref(storage, 'public/products/p1/web.jpg'), bytes, { contentType: 'image/jpeg' });
    await uploadBytes(ref(storage, 'uploads/POT-1001/p1/original.jpg'), bytes, { contentType: 'image/jpeg' });
    await uploadBytes(ref(storage, 'public/other/x.jpg'), bytes, { contentType: 'image/jpeg' });
  });
});
after(() => testEnv.cleanup());

// Every kind of client: anonymous, signed-in customer, and a user holding an admin custom claim.
const clients = () => ({
  anonymous: testEnv.unauthenticatedContext(),
  customer: testEnv.authenticatedContext('customerUid'),
  'admin-claim': testEnv.authenticatedContext('adminUid', { role: 'admin' }),
  'superadmin-claim': testEnv.authenticatedContext('superUid', { role: 'superadmin' }),
});

test('Firestore: every collection denies all client reads and writes (even for admin claims)', async () => {
  for (const [who, ctx] of Object.entries(clients())) {
    const db = ctx.firestore();
    for (const name of Object.values(COLLECTIONS)) {
      const label = `${who} -> ${name}`;
      await assertFails(getDoc(doc(db, name, 'seed')), `read ${label}`);
      await assertFails(getDocs(collection(db, name)), `list ${label}`);
      await assertFails(setDoc(doc(db, name, 'new-doc'), { a: 1 }), `create ${label}`);
      await assertFails(updateDoc(doc(db, name, 'seed'), { a: 2 }), `update ${label}`);
      await assertFails(deleteDoc(doc(db, name, 'seed')), `delete ${label}`);
    }
  }
});

test('Firestore: a client cannot self-assign a potter or device', async () => {
  const db = testEnv.authenticatedContext('deviceLikeClient').firestore();
  await assertFails(setDoc(doc(db, COLLECTIONS.devices, 'DEV-001'), { potterId: 'POT-1001', status: 'active' }));
  await assertFails(updateDoc(doc(db, COLLECTIONS.devices, 'seed'), { potterId: 'POT-1001' }));
});

test('Storage: only approved-product web copies are publicly readable, and nobody can write', async () => {
  for (const [who, ctx] of Object.entries(clients())) {
    const storage = ctx.storage();
    await assertSucceeds(getBytes(ref(storage, 'public/products/p1/web.jpg')), `read public copy as ${who}`);
    await assertFails(getBytes(ref(storage, 'uploads/POT-1001/p1/original.jpg')), `read original as ${who}`);
    await assertFails(getBytes(ref(storage, 'public/other/x.jpg')), `read other public path as ${who}`);
    await assertFails(uploadBytes(ref(storage, 'public/products/p1/hack.jpg'), new Uint8Array([1])), `write public as ${who}`);
    await assertFails(uploadBytes(ref(storage, 'uploads/POT-1001/p2/original.jpg'), new Uint8Array([1])), `write upload as ${who}`);
    await assertFails(deleteObject(ref(storage, 'public/products/p1/web.jpg')), `delete public as ${who}`);
  }
});
