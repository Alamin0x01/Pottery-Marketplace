// Validates Firebase configuration and probes connectivity (read-only; nothing is written).
// Usage: npm run check:firebase      (reads backend/.env)
import { loadEnv } from '../src/config/env.js';
import { createFirebase, checkFirebase, FirebaseConfigError } from '../src/config/firebase.js';

let firebase;
try {
  firebase = createFirebase(loadEnv(), { appName: 'check-firebase' });
} catch (err) {
  console.error(`✖ Configuration error: ${err.message}`);
  if (!(err instanceof FirebaseConfigError)) console.error('  (see docs/FIREBASE_SETUP.md)');
  process.exit(2);
}

const { projectId, storageBucket, useEmulators } = firebase.config;
console.log(`Project: ${projectId}`);
console.log(`Bucket:  ${storageBucket}`);
console.log(`Mode:    ${useEmulators ? 'EMULATORS (no real data touched)' : 'REAL Firebase project'}`);

const result = await checkFirebase(firebase);
for (const [name, check] of Object.entries(result.checks)) {
  console.log(`${check.ok ? '✔' : '✖'} ${name.padEnd(9)} ${check.ok ? `${check.ms} ms` : check.error}`);
}
await firebase.close();
process.exit(result.ok ? 0 : 1);
