import pino from 'pino';

// Secrets, credentials and personal data must never reach logs.
// Header names are lower-case in Node. `*.x` matches `x` one level deep in any logged object.
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-device-secret"]',
  'req.headers["x-tracking-token"]',
  'res.headers["set-cookie"]',
  '*.secret',
  '*.credentialHash',
  '*.trackingToken',
  '*.private_key',
  '*.buyerPhone',
  '*.deliveryAddress',
  '*.phone',
  '*.address',
];

export function createLogger(env, destination) {
  return pino(
    {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT, censor: '[redacted]' },
    },
    destination,
  );
}
