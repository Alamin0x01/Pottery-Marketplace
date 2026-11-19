import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums.js';
import { text, phone, sha256Hex, docId, orderId, deviceId, district } from './common.js';

// No `potterId`, `listedPrice` or product snapshot fields: the repository derives them from the
// product document so a caller can never choose them.
export const orderCreateSchema = z.strictObject({
  productId: docId,
  customerId: docId.nullable().default(null),
  trackingTokenHash: sha256Hex,
  idempotencyKey: text(8, 128),
  buyerName: text(2, 100),
  buyerPhone: phone,
  deliveryAddress: text(10, 300),
  deliveryDistrict: district.nullable().default(null),
  quantity: z.number().int().min(1).max(50),
});

// `potterId` is derived from the order; the device must belong to that potter.
export const notificationCreateSchema = z.strictObject({
  orderId,
  deviceId,
  type: z.enum(NOTIFICATION_TYPES),
});
