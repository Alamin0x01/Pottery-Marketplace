import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createFirebase, createReadinessProbe } from './config/firebase.js';
import { createApp } from './app.js';
import { createRepositories } from './repositories/index.js';

/**
 * Builds everything the API needs (validated env, logger, Firebase Admin, repositories, Express app) WITHOUT opening a
 * port. Shared by the long-running server (`server.js`) and the Vercel serverless entry (`api/index.js`), so both run
 * exactly the same application. Throws `FirebaseConfigError` / an env error when the configuration is invalid.
 */
export function createRuntime({ env = loadEnv(), logger = createLogger(env) } = {}) {
  const firebase = createFirebase(env);
  const app = createApp({
    env,
    logger,
    readiness: createReadinessProbe(firebase),
    auth: firebase.auth,
    repos: createRepositories(firebase.db),
  });
  return { env, logger, firebase, app };
}
