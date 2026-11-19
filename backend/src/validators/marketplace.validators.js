import { z } from 'zod';
import { CATEGORIES } from '../db/enums.js';
import { potterId, docId, district, phone, text } from '../db/schemas/common.js';
import { addressInputSchema, addressPatchSchema, customerProfilePatchSchema } from '../db/schemas/accounts.js';

// Public/customer query and body schemas. All are strict: unknown keys are a 400.
const cursor = z.string().min(1).max(300);
const price = z.coerce.number().int().min(0).max(10_000_000);

export const SORTS = ['newest', 'price_asc', 'price_desc'];

export const productsQuery = z
  .strictObject({
    q: z.string().trim().min(1).max(60).optional(),
    category: z.enum(CATEGORIES).optional(),
    minPrice: price.optional(),
    maxPrice: price.optional(),
    sort: z.enum(SORTS).default('newest'),
    potterId: potterId.optional(),
    featured: z.enum(['true']).transform(() => true).optional(),
    limit: z.coerce.number().int().min(1).max(48).default(12),
    cursor: cursor.optional(),
  })
  .refine((v) => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, {
    message: 'minPrice must not be greater than maxPrice',
    path: ['minPrice'],
  });

export const productParams = z.strictObject({ id: docId });
export const noQuery = z.strictObject({});
export const listQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(50).default(10), cursor: cursor.optional() });

export const orderBody = z.strictObject({
  productId: docId,
  quantity: z.number().int().min(1).max(50),
  buyerName: text(2, 100),
  buyerPhone: phone,
  deliveryAddress: text(10, 300),
  deliveryDistrict: district,
});
export const orderParams = z.strictObject({ id: z.string().regex(/^ORD-[A-Z2-7]{10}$/, 'invalid order id') });

export const profileBody = customerProfilePatchSchema;
export const addressBody = addressInputSchema;
export const addressPatchBody = addressPatchSchema;
export const addressParams = z.strictObject({ addressId: z.string().regex(/^[a-z0-9]{8,16}$/, 'invalid address id') });
