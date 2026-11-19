import { randomBytes } from 'node:crypto';

export const ID_PATTERNS = Object.freeze({
  potter: /^POT-\d{4,}$/,
  device: /^DEV-\d{3,}$/,
  order: /^ORD-[A-Z2-7]{10}$/,
  captureId: /^[A-Za-z0-9_-]{8,64}$/,
  docId: /^[A-Za-z0-9_-]{1,128}$/,
  notification: /^ORD-[A-Z2-7]{10}_(NEW_ORDER|ORDER_CANCELLED)$/,
});

export const formatPotterId = (n) => `POT-${n}`;
export const formatDeviceId = (n) => `DEV-${String(n).padStart(3, '0')}`;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Unguessable, human-readable order ID: 10 chars of base32 (50 bits of randomness). */
export function generateOrderId() {
  const bytes = randomBytes(10);
  let id = '';
  for (const b of bytes) id += BASE32[b % 32]; // 256 % 32 === 0, so no modulo bias
  return `ORD-${id}`;
}

export const uploadDocId = (deviceId, captureId) => `${deviceId}_${captureId}`;
export const notificationDocId = (orderId, type) => `${orderId}_${type}`;
