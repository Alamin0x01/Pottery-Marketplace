import { z } from 'zod';

// Empty values in a .env file (`KEY=`) are treated as unset.
const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const hostPort = z.string().regex(/^[a-zA-Z0-9.-]+:\d{2,5}$/, 'must look like host:port');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .refine((list) => list.every((o) => URL.canParse(o)), 'CORS_ORIGINS must be a comma-separated list of origins'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // A device counts as "online" if it contacted the server within this many seconds (3x the default poll).
    DEVICE_ONLINE_WINDOW_SEC: z.coerce.number().int().min(60).max(86_400).default(900),

    // Firebase (completeness and cross-checks are validated in config/firebase.js)
    FIREBASE_PROJECT_ID: optional(z.string().regex(/^[a-z][a-z0-9-]{3,28}[a-z0-9]$/, 'is not a valid Firebase project id')),
    FIREBASE_STORAGE_BUCKET: optional(z.string().regex(/^[a-z0-9][a-z0-9._-]{2,221}$/, 'is not a valid bucket name')),
    FIREBASE_SERVICE_ACCOUNT_B64: optional(z.string().min(1)),
    GOOGLE_APPLICATION_CREDENTIALS: optional(z.string().min(1)),
    FIRESTORE_EMULATOR_HOST: optional(hostPort),
    FIREBASE_AUTH_EMULATOR_HOST: optional(hostPort),
    FIREBASE_STORAGE_EMULATOR_HOST: optional(hostPort),
  })
  .superRefine((env, ctx) => {
    const emulators = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'];
    if (env.NODE_ENV === 'production') {
      for (const key of emulators) {
        if (env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'must not be set in production' });
      }
    }
  });

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return Object.freeze(parsed.data);
}
