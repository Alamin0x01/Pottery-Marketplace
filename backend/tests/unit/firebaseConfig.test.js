import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../../src/config/env.js';
import { resolveFirebaseConfig, FirebaseConfigError } from '../../src/config/firebase.js';

// Structurally valid but NON-FUNCTIONAL placeholder: only used to exercise validation logic.
const placeholderKey = (projectId = 'demo-pottery') => ({
  type: 'service_account',
  project_id: projectId,
  client_email: `test@${projectId}.iam.gserviceaccount.com`,
  private_key: '-----BEGIN PRIVATE KEY-----\nNOT-A-REAL-KEY\n-----END PRIVATE KEY-----\n',
});
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

const base = { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-pottery', FIREBASE_STORAGE_BUCKET: 'demo-pottery.appspot.com' };
const emulators = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};
const resolve = (extra) => resolveFirebaseConfig(loadEnv({ ...base, ...extra }));
const rejects = (extra, pattern) => assert.throws(() => resolve(extra), (e) => e instanceof FirebaseConfigError && pattern.test(e.message));

test('project id and bucket are required', () => {
  assert.throws(() => resolveFirebaseConfig(loadEnv({ NODE_ENV: 'test' })), /FIREBASE_PROJECT_ID is required/);
  assert.throws(() => resolveFirebaseConfig(loadEnv({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-pottery' })), /FIREBASE_STORAGE_BUCKET is required/);
});

test('real mode needs credentials', () => {
  rejects({}, /No Firebase credentials/);
});

test('accepts a base64 service account that matches the project', () => {
  const cfg = resolve({ FIREBASE_SERVICE_ACCOUNT_B64: b64(placeholderKey()) });
  assert.equal(cfg.useEmulators, false);
  assert.equal(cfg.serviceAccount.project_id, 'demo-pottery');
});

test('accepts a key file path (GOOGLE_APPLICATION_CREDENTIALS)', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fb-')), 'key.json');
  writeFileSync(file, JSON.stringify(placeholderKey()));
  assert.equal(resolve({ GOOGLE_APPLICATION_CREDENTIALS: file }).serviceAccount.client_email.includes('@'), true);
  rejects({ GOOGLE_APPLICATION_CREDENTIALS: join(tmpdir(), 'does-not-exist.json') }, /cannot be read/);
});

test('rejects malformed or mismatched service accounts without echoing secrets', () => {
  rejects({ FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from('not json').toString('base64') }, /not valid JSON/);
  rejects({ FIREBASE_SERVICE_ACCOUNT_B64: b64({ ...placeholderKey(), type: 'authorized_user' }) }, /service-account key/);
  rejects({ FIREBASE_SERVICE_ACCOUNT_B64: b64({ ...placeholderKey(), private_key: 'oops' }) }, /malformed private_key/);
  rejects({ FIREBASE_SERVICE_ACCOUNT_B64: b64({ ...placeholderKey(), client_email: undefined }) }, /missing "client_email"/);
  rejects({ FIREBASE_SERVICE_ACCOUNT_B64: b64(placeholderKey('other-project')) }, /belongs to project "other-project"/);
  try {
    resolve({ FIREBASE_SERVICE_ACCOUNT_B64: b64({ ...placeholderKey(), private_key: 'SECRET-VALUE-123' }) });
  } catch (e) {
    assert.ok(!e.message.includes('SECRET-VALUE-123'));
  }
});

test('emulator mode needs all three hosts and no credentials', () => {
  const cfg = resolve(emulators);
  assert.equal(cfg.useEmulators, true);
  assert.equal(cfg.serviceAccount, null);
  rejects({ FIRESTORE_EMULATOR_HOST: emulators.FIRESTORE_EMULATOR_HOST }, /needs all three emulator hosts; missing: FIREBASE_AUTH_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST/);
});

test('emulators are refused in production', () => {
  assert.throws(() => loadEnv({ ...base, ...emulators, NODE_ENV: 'production' }), /must not be set in production/);
});

test('env validation rejects malformed Firebase values and treats empty values as unset', () => {
  assert.throws(() => loadEnv({ ...base, FIREBASE_PROJECT_ID: 'Bad Project' }), /not a valid Firebase project id/);
  assert.throws(() => loadEnv({ ...base, FIRESTORE_EMULATOR_HOST: 'nonsense' }), /host:port/);
  const env = loadEnv({ ...base, FIREBASE_SERVICE_ACCOUNT_B64: '', GOOGLE_APPLICATION_CREDENTIALS: '' });
  assert.equal(env.FIREBASE_SERVICE_ACCOUNT_B64, undefined);
});
