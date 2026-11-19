import { z } from 'zod';
import { COLLECTIONS } from '../collections.js';
import { ID_PATTERNS } from '../../utils/ids.js';
import { actor, text, sha256Hex } from './common.js';

// Keys that must never be written into audit snapshots.
const SECRET_KEY = /secret|password|private_?key|credentialhash|token/i;

function containsSecretKey(value) {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => SECRET_KEY.test(k) || containsSecretKey(v));
  }
  return false;
}

const snapshot = z
  .record(z.string(), z.unknown())
  .refine((v) => !containsSecretKey(v), 'must not contain secret-like keys')
  .nullable()
  .default(null);

export const auditEntrySchema = z.strictObject({
  actor,
  action: z.string().regex(/^[a-z][a-z0-9_.]{2,63}$/, 'action must look like "device.assign"'),
  target: z.strictObject({ collection: z.enum(Object.values(COLLECTIONS)), id: text(1, 200) }),
  before: snapshot,
  after: snapshot,
});

export const uploadMetaSchema = z.strictObject({
  captureId: z.string().regex(ID_PATTERNS.captureId, 'invalid capture id'),
  sizeBytes: z.number().int().min(1).max(5_000_000),
  sha256: sha256Hex,
});
