import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createFirebase, checkFirebase, createReadinessProbe, FirebaseConfigError } from './config/firebase.js';
import { createApp } from './app.js';
import { createRepositories } from './repositories/index.js';

const env = loadEnv();
const logger = createLogger(env);

let firebase;
try {
  firebase = createFirebase(env);
} catch (err) {
  if (err instanceof FirebaseConfigError) {
    logger.fatal(`Firebase configuration error: ${err.message}. See docs/FIREBASE_SETUP.md`);
    process.exit(1);
  }
  throw err;
}

const app = createApp({
  env,
  logger,
  readiness: createReadinessProbe(firebase),
  auth: firebase.auth,
  repos: createRepositories(firebase.db),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, firebase: firebase.config }, 'backend listening');
  // Report connectivity at boot without blocking startup; /health/ready keeps reporting it.
  checkFirebase(firebase).then(
    (result) => logger[result.ok ? 'info' : 'error']({ checks: result.checks }, 'firebase connectivity check'),
    (err) => logger.error({ err }, 'firebase connectivity check crashed'),
  );
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await firebase.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
