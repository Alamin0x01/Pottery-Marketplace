import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { readFirebaseConfig } from './firebaseConfig.js';

// Only Firebase Authentication is initialised in the browser. Firestore and Storage are deliberately NOT
// used from the client: all data access goes through the backend API (see docs/SYSTEM_ARCHITECTURE.md),
// and the Firestore/Storage security rules deny all direct client access.
let instance;

/** Lazily initialises Firebase so pages that do not need it still work when it is not configured. */
export function getFirebase() {
  if (!instance) {
    const { config, useEmulators, authEmulatorUrl } = readFirebaseConfig(import.meta.env);
    const app = initializeApp(config);
    const auth = getAuth(app);
    if (useEmulators) connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
    instance = { app, auth, runtime: { useEmulators, authEmulatorUrl } };
  }
  return instance;
}

export const getFirebaseAuth = () => getFirebase().auth;
/** `{ useEmulators, authEmulatorUrl }`, used to make connection errors specific. */
export const getFirebaseRuntime = () => getFirebase().runtime;
