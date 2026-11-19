import { z } from 'zod';
import { ORDER_STATUS, PRODUCT_STATUS, POTTER_STATUS } from '../db/enums.js';
import { potterId, deviceId, district as districtSchema } from '../db/schemas/common.js';
import { potterAdminCreateSchema, potterAdminUpdateSchema, potterStatusSchema } from '../db/schemas/potters.js';
import { deviceRegisterSchema, deviceStatusSchema, statusReasonSchema } from '../db/schemas/devices.js';

// All admin query schemas are strict: unknown parameters are a 400, never silently ignored.
const limit = (max, fallback) => z.coerce.number().int().min(1).max(max).default(fallback);
const cursor = z.string().min(1).max(300);

export const listQuery = z.strictObject({ limit: limit(100, 20), cursor: cursor.optional() });

export const ordersQuery = listQuery.extend({
  status: z.enum(ORDER_STATUS).optional(),
  potterId: potterId.optional(),
  needsAttention: z.enum(['true', 'false']).optional(),
});

export const productsQuery = listQuery.extend({
  status: z.enum(PRODUCT_STATUS).optional(),
  potterId: potterId.optional(),
});

export const activityQuery = z.strictObject({ limit: limit(50, 10) });

export const searchQuery = z.strictObject({ q: z.string().trim().min(1).max(40) });

export const noQuery = z.strictObject({});

// ---- Phase 4: potters and devices ---------------------------------------------------------------
export const DEVICE_FILTER_STATUS = ['unassigned', 'active', 'offline', 'disabled', 'lost'];

export const pottersQuery = listQuery.extend({
  q: z.string().trim().min(1).max(60).optional(),
  status: z.enum(POTTER_STATUS).optional(),
  district: districtSchema.optional(),
});

export const potterParams = z.strictObject({ id: potterId });
export const potterBody = potterAdminCreateSchema;
export const potterPatchBody = potterAdminUpdateSchema;
export const potterStatusBody = z.strictObject({ status: potterStatusSchema });

export const devicesQuery = listQuery.extend({
  q: z.string().trim().min(1).max(20).optional(),
  status: z.enum(DEVICE_FILTER_STATUS).optional(),
});

export const deviceParams = z.strictObject({ id: deviceId });
export const deviceRegisterBody = z.strictObject({
  model: deviceRegisterSchema.shape.model.optional(),
  pollIntervalSec: deviceRegisterSchema.shape.pollIntervalSec.optional(),
});
export const deviceAssignBody = z.strictObject({ deviceId, potterId });
export const deviceStatusBody = z.strictObject({ status: deviceStatusSchema, reason: statusReasonSchema.optional() });
export const deviceRevokeBody = z.strictObject({ reason: statusReasonSchema.optional() });
export const emptyBody = z.strictObject({});
