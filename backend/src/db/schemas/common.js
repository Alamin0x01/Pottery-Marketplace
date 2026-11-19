import { z } from 'zod';
import { normalizeBdPhone } from '../../utils/phone.js';
import { canonicalDistrict } from '../../utils/districts.js';
import { ID_PATTERNS } from '../../utils/ids.js';
import { ACTOR_TYPES } from '../enums.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trimmed string without control characters, with length bounds applied after cleaning. */
export const text = (min, max) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, '').trim())
    .pipe(z.string().min(min).max(max));

export const phone = z.string().transform((value, ctx) => {
  const normalized = normalizeBdPhone(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'must be a valid Bangladeshi mobile number (01XXXXXXXXX)' });
    return z.NEVER;
  }
  return normalized;
});

/** Integer BDT (taka); never floats. */
export const money = z.number().int().min(1).max(10_000_000);

export const potterId = z.string().regex(ID_PATTERNS.potter, 'invalid potter id');

/** A Bangladesh district, normalised to its canonical spelling ("comilla" -> "Cumilla"). */
export const district = z.string().transform((value, ctx) => {
  const canonical = canonicalDistrict(value);
  if (!canonical) {
    ctx.addIssue({ code: 'custom', message: 'must be one of the 64 districts of Bangladesh' });
    return z.NEVER;
  }
  return canonical;
});
export const deviceId = z.string().regex(ID_PATTERNS.device, 'invalid device id');
export const orderId = z.string().regex(ID_PATTERNS.order, 'invalid order id');
export const docId = z.string().regex(ID_PATTERNS.docId, 'invalid document id');
export const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'must be a lowercase SHA-256 hex digest');

/** Who performed an action: a person (admin), the platform itself (system) or a device. */
export const actor = z.strictObject({ type: z.enum(ACTOR_TYPES), id: text(1, 128) });

export const hasKeys = (obj) => Object.keys(obj).length > 0;
export const NO_FIELDS = 'at least one field is required';
