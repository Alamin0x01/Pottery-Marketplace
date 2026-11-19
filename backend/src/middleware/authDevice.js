import { ApiError } from '../utils/ApiError.js';
import { ID_PATTERNS } from '../utils/ids.js';
import { SECRET_PATTERN, verifyDeviceSecret } from '../utils/deviceCredentials.js';

const tooManyFailures = (retryAfterSec) => {
  const err = new ApiError(429, 'RATE_LIMITED', 'Too many failed attempts');
  err.retryAfterSec = retryAfterSec;
  return err;
};

/**
 * Authenticates an IoT device from `X-Device-Id` + `X-Device-Secret` and sets `req.device`.
 *
 *  - The potter is resolved from the stored DEVICE RECORD. Nothing in the body, query or headers can name a potter.
 *  - A secret comparison always happens (against a dummy digest for unknown/revoked/malformed credentials), in
 *    constant time, so "no such device", "wrong secret" and "revoked" are indistinguishable: all are a generic 401.
 *  - Only a device that proves its secret can learn its status: disabled/lost/unassigned devices and devices of an
 *    inactive potter get 403, and that refusal is recorded in the device's communication history.
 *  - The failure throttle is consulted only after a failed check, so valid devices behind a shared carrier-grade NAT
 *    address are never blocked by someone else's bad credentials.
 */
export function authenticateDevice({ devices, potters, throttle, logger }) {
  return async (req, _res, next) => {
    try {
      const deviceId = req.get('x-device-id') ?? '';
      const secret = req.get('x-device-secret') ?? '';
      const wellFormed = ID_PATTERNS.device.test(deviceId) && SECRET_PATTERN.test(secret);

      let record = null;
      if (wellFormed) {
        try {
          record = await devices.getForAuth(deviceId);
        } catch (err) {
          logger?.error({ err: { code: err?.code, name: err?.name } }, 'device lookup unavailable');
          throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service unavailable, please retry');
        }
      }

      const valid = verifyDeviceSecret(secret, wellFormed ? (record?.credentialHash ?? null) : null) && Boolean(record);
      if (!valid) {
        const keys = [`ip:${req.ip}`, ...(wellFormed ? [`dev:${deviceId}`] : [])];
        const blocked = keys.map((k) => throttle.fail(k)).find((r) => r.blocked);
        throw blocked ? tooManyFailures(blocked.retryAfterSec) : ApiError.unauthorized('Invalid device credentials');
      }

      const refuse = async (reason, message) => {
        await devices.recordRejected({ deviceId, potterId: record.potterId, reason }).catch((err) => {
          logger?.warn({ err: { code: err?.code, name: err?.name }, deviceId }, 'could not record rejected device request');
        });
        throw ApiError.forbidden(message);
      };

      if (record.status !== 'active' || !record.potterId) {
        await refuse(`device_${record.status}`, 'This device is not active');
      }
      const potter = await potters.get(record.potterId);
      if (!potter || potter.status !== 'active') await refuse('potter_inactive', 'This device is not active');

      req.device = { deviceId, potterId: record.potterId, pollIntervalSec: record.pollIntervalSec };
      next();
    } catch (err) {
      next(err);
    }
  };
}
