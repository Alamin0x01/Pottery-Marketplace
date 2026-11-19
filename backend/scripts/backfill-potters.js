// One-off, idempotent migration for potters created before Phase 4 (no search fields, no phone reservation).
//
//   npm run backfill:potters -- --dry-run     (report only)
//   npm run backfill:potters                  (apply)
//
// For every potter it (1) adds `nameLower` / `searchTokens` and (2) creates the `potter_phones/{phone}` reservation
// that enforces phone uniqueness. If two potters share a phone number the second one is REPORTED and left alone;
// an admin must correct it by hand (this script never guesses which record is right).
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { COLLECTIONS } from '../src/db/collections.js';
import { buildSearchTokens } from '../src/utils/search.js';

const dryRun = process.argv.includes('--dry-run');
const firebase = createFirebase(loadEnv(), { appName: 'backfill-potters' });
const { db } = firebase;

let updated = 0;
let reserved = 0;
const conflicts = [];

const snapshot = await db.collection(COLLECTIONS.potters).get();
for (const doc of snapshot.docs) {
  const p = doc.data();
  const patch = {};
  if (typeof p.nameLower !== 'string' || !Array.isArray(p.searchTokens)) {
    patch.nameLower = p.name.toLowerCase();
    patch.searchTokens = buildSearchTokens({ name: p.name, tags: [p.village] });
  }

  const phoneRef = db.collection(COLLECTIONS.potterPhones).doc(p.phone);
  const owner = await phoneRef.get();
  const needsReservation = !owner.exists;
  if (owner.exists && owner.data().potterId !== doc.id) {
    conflicts.push({ potterId: doc.id, phoneOwner: owner.data().potterId });
  }

  if (!dryRun) {
    if (Object.keys(patch).length > 0) await doc.ref.update(patch);
    if (needsReservation) await phoneRef.create({ potterId: doc.id, createdAt: new Date() });
  }
  if (Object.keys(patch).length > 0) updated += 1;
  if (needsReservation) reserved += 1;
}

console.log(`${dryRun ? '[dry run] ' : ''}potters checked: ${snapshot.size}, search fields added: ${updated}, phone reservations created: ${reserved}`);
if (conflicts.length > 0) {
  console.warn(`⚠ ${conflicts.length} potter(s) share a phone number with another potter and were not reserved:`);
  for (const c of conflicts) console.warn(`  ${c.potterId} (number already reserved by ${c.phoneOwner})`);
  process.exitCode = 1;
}
await firebase.close();
