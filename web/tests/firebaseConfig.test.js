import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFirebaseConfig } from '../src/lib/firebaseConfig.js';

const valid = {
  VITE_FIREBASE_API_KEY: 'public-web-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-project',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
};

test('accepts a complete web configuration', () => {
  const { config, useEmulators } = readFirebaseConfig(valid);
  assert.equal(config.projectId, 'demo-project');
  assert.equal(useEmulators, false);
});

test('names every missing variable', () => {
  assert.throws(
    () => readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'x' }),
    /VITE_FIREBASE_AUTH_DOMAIN.*VITE_FIREBASE_PROJECT_ID.*VITE_FIREBASE_APP_ID/,
  );
});

test('refuses Admin credentials exposed through VITE_ variables', () => {
  assert.throws(() => readFirebaseConfig({ ...valid, VITE_FIREBASE_SERVICE_ACCOUNT_B64: 'abc' }), /Admin SDK credential/);
  assert.throws(
    () => readFirebaseConfig({ ...valid, VITE_SOMETHING: '-----BEGIN PRIVATE KEY-----\nabc' }),
    /Admin SDK credential/,
  );
});

test('emulators are refused in a production build', () => {
  assert.throws(() => readFirebaseConfig({ ...valid, VITE_USE_FIREBASE_EMULATORS: 'true', PROD: true }), /production/);
  assert.equal(readFirebaseConfig({ ...valid, VITE_USE_FIREBASE_EMULATORS: 'true', PROD: false }).useEmulators, true);
});
