const REQUIRED = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

// Anything that looks like an Admin SDK credential must never be bundled into browser code.
const FORBIDDEN_NAME = /SERVICE_ACCOUNT|PRIVATE_KEY|ADMIN_SDK|CLIENT_SECRET/i;
const FORBIDDEN_VALUE = /BEGIN (RSA )?PRIVATE KEY|"type"\s*:\s*"service_account"/;

/**
 * Validates the Firebase *web* configuration from Vite env vars (public by design) and refuses to start
 * if an Admin credential has been placed in a VITE_* variable. Pure function: `env` is injected.
 */
export function readFirebaseConfig(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue;
    if (FORBIDDEN_NAME.test(name) || (typeof value === 'string' && FORBIDDEN_VALUE.test(value))) {
      throw new Error(`${name} looks like an Admin SDK credential. Secrets must never be exposed to the browser.`);
    }
  }

  const missing = Object.values(REQUIRED).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase web configuration: ${missing.join(', ')}. Copy web/.env.example to web/.env.local and fill it in (docs/FIREBASE_SETUP.md).`,
    );
  }

  const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';
  if (useEmulators && env.PROD) {
    throw new Error('VITE_USE_FIREBASE_EMULATORS must not be enabled in a production build.');
  }

  return {
    config: Object.fromEntries(Object.entries(REQUIRED).map(([key, name]) => [key, env[name]])),
    useEmulators,
    authEmulatorUrl: env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099',
  };
}
