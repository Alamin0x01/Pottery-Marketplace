import { z } from 'zod';
import { CATEGORIES, IMAGE_KINDS } from '../enums.js';
import { text, money, hasKeys, NO_FIELDS } from './common.js';

export const imageSchema = z.strictObject({
  path: text(1, 300),
  kind: z.enum(IMAGE_KINDS),
  w: z.number().int().min(1).max(10_000).nullable().default(null),
  h: z.number().int().min(1).max(10_000).nullable().default(null),
});

export const draftImagesSchema = z.array(imageSchema).min(1).max(5);

const tag = text(1, 30).transform((t) => t.toLowerCase());

// Fields an admin may edit. Ownership (potterId/deviceId), status, AI and approval fields are
// never writable through this schema.
const mutable = {
  name: text(2, 120),
  description: text(10, 2000),
  category: z.enum(CATEGORIES),
  material: text(2, 100),
  tags: z.array(tag).max(10),
  price: money.nullable(),
  stock: z.number().int().min(0).max(10_000),
  featured: z.boolean(),
};

export const productUpdateSchema = z.strictObject(mutable).partial().refine(hasKeys, NO_FIELDS);

export const rejectionReasonSchema = text(3, 300);
