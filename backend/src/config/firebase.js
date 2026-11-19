import fs from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

const EMULATOR_KEYS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'];

export class FirebaseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

function parseServiceAccount(raw, source) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new FirebaseConfigError(`${source} is not valid JSON`);
  }
  if (json?.type !== 'service_account') {
    throw new FirebaseConfigError(`${source} is not a service-account key (type must be "service_account")`);
  }
  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (typeof json[key] !== 'string' || !json[key]) {
      throw new FirebaseConfigError(`${source} is missing "${key}"`);
    }
  }
  if (!json.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new FirebaseConfigError(`${source} has a malformed private_key`);
  }
  return json;
}

/**
 * Validates Firebase settings and returns a plain description of how to connect.
 * Error messages never include credential values.
 *  - emulator mode: all three emulator hosts set (never allowed in production)
 *  - real mode: project id + bucket + a service account (base64 env var, or a key-file path)
 */
export function resolveFirebaseConfig(env) {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_STORAGE_BUCKET: storageBucket } = env;
  if (!projectId) throw new FirebaseConfigError('FIREBASE_PROJECT_ID is required');
  if (!storageBucket) throw new FirebaseConfigError('FIREBASE_STORAGE_BUCKET is required');

  const emulatorKeysSet = EMULATOR_KEYS.filter((k) => env[k]);
  if (emulatorKeysSet.length > 0) {
    if (env.NODE_ENV === 'production') {
      throw new FirebaseConfigError('Firebase emulators must not be configured in production');
    }
    if (emulatorKeysSet.length !== EMULATOR_KEYS.length) {
      // A half-emulated setup could silently write to the real project.
      const missing = EMULATOR_KEYS.filter((k) => !env[k]).join(', ');
      throw new FirebaseConfigError(`Emulator mode needs all three emulator hosts; missing: ${missing}`);
    }
    return { projectId, storageBucket, useEmulators: true, serviceAccount: null };
  }

  let raw;
  let source;
  if (env.FIREBASE_SERVICE_ACCOUNT_B64) {
    source = 'FIREBASE_SERVICE_ACCOUNT_B64';
    raw = Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    source = 'GOOGLE_APPLICATION_CREDENTIALS file';
    try {
      raw = fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
    } catch {
      throw new FirebaseConfigError('GOOGLE_APPLICATION_CREDENTIALS points to a file that cannot be read');
    }
  } else {
    throw new FirebaseConfigError(
      'No Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_B64 or GOOGLE_APPLICATION_CREDENTIALS (or use the emulators)',
    );
  }

  const serviceAccount = parseServiceAccount(raw, source);
  if (serviceAccount.project_id !== projectId) {
    // Prevents pointing e.g. production credentials at a development configuration.
    throw new FirebaseConfigError(
      `Service account belongs to project "${serviceAccount.project_id}" but FIREBASE_PROJECT_ID is "${projectId}"`,
    );
  }
  return { projectId, storageBucket, useEmulators: false, serviceAccount };
}

export function createFirebase(env, { appName = 'pottery-backend' } = {}) {
  const config = resolveFirebaseConfig(env);

  if (config.useEmulators) {
    // The Admin SDK reads emulator locations from process.env when clients are created.
    for (const key of EMULATOR_KEYS) process.env[key] = env[key];
  }

  const app = initializeApp(
    {
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      ...(config.serviceAccount ? { credential: cert(config.serviceAccount) } : {}),
    },
    appName,
  );

  return {
    app,
    db: getFirestore(app),
    auth: getAuth(app),
    bucket: getStorage(app).bucket(),
    // Never include the service account here: this object is safe to log.
    config: { projectId: config.projectId, storageBucket: config.storageBucket, useEmulators: config.useEmulators },
    close: () => deleteApp(app),
  };
}

const CODES = {
  5: 'NOT_FOUND (is Firestore created for this project?)',
  7: 'PERMISSION_DENIED (service account lacks access)',
  14: 'UNAVAILABLE (network or emulator unreachable)',
  16: 'UNAUTHENTICATED (invalid credentials)',
  // HTTP status codes returned by Cloud Storage
  401: 'UNAUTHENTICATED (invalid credentials)',
  403: 'PERMISSION_DENIED (service account lacks access to the bucket)',
  404: 'NOT_FOUND (check FIREBASE_STORAGE_BUCKET and that Storage is enabled)',
};

function describeError(err) {
  if (err?.message === 'TIMEOUT') return 'TIMEOUT';
  if (CODES[err?.code]) return CODES[err.code];
  if (typeof err?.code === 'string') return err.code; // e.g. auth/configuration-not-found
  return err?.name ?? 'UNKNOWN_ERROR';
}

async function timed(fn, timeoutMs) {
  const started = Date.now();
  let timer;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: describeError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Read-only connectivity probe of Firestore, Storage and Auth. Never writes. */
export async function checkFirebase(fb, { timeoutMs = 8000 } = {}) {
  const [firestore, storage, auth] = await Promise.all([
    timed(() => fb.db.collection('counters').doc('__connectivity_probe').get(), timeoutMs),
    // Listing one object proves the bucket exists and the credentials may use it. (`bucket.exists()` is not
    // used: the Storage emulator only creates a bucket on first write, so it would report false there.)
    timed(() => fb.bucket.getFiles({ maxResults: 1, autoPaginate: false }), timeoutMs),
    timed(() => fb.auth.listUsers(1), timeoutMs),
  ]);
  return { ok: firestore.ok && storage.ok && auth.ok, checks: { firestore, storage, auth } };
}

/** Cached probe for the readiness endpoint, so public traffic cannot generate unbounded Firestore reads. */
export function createReadinessProbe(fb, { ttlMs = 10_000 } = {}) {
  let cached = null;
  let cachedAt = 0;
  let inflight = null;
  return async () => {
    if (cached && Date.now() - cachedAt < ttlMs) return cached;
    inflight ??= checkFirebase(fb, { timeoutMs: 5000 }).finally(() => {
      inflight = null;
    });
    cached = await inflight;
    cachedAt = Date.now();
    return cached;
  };
}
