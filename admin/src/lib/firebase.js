import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { readFirebaseConfig } from './firebaseConfig.js';

// Only Firebase Authentication is used in the browser. All data goes through the backend API, which
// verifies the ID token and the admin role claim on every request. Firebase persists the session in
// the browser (IndexedDB), so a signed-in admin stays signed in across reloads.
let instance;

export function getFirebase() {
  if (!instance) {
    const { config, useEmulators, authEmulatorUrl } = readFirebaseConfig(import.meta.env);
    const app = initializeApp(config);
    const auth = getAuth(app);
    if (useEmulators) connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
    instance = { app, auth, useEmulators, authEmulatorUrl };
  }
  return instance;
}

export const getFirebaseAuth = () => getFirebase().auth;

/** Where sign-in requests go: `{ useEmulators, authEmulatorUrl }` (used to explain connection failures precisely). */
export function getFirebaseRuntime() {
  const { useEmulators, authEmulatorUrl } = getFirebase();
  return { useEmulators, authEmulatorUrl };
}
