import express, { Router } from 'express';
import { z } from 'zod';
import { authenticateDevice } from '../../middleware/authDevice.js';
import { deviceLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { deviceTelemetrySchema } from '../../db/schemas/devices.js';
import { createFailureThrottle } from '../../utils/failureThrottle.js';

const noQuery = z.strictObject({});
// Telemetry only. A `potterId` (or any other unknown key) in the body is a 400: the device cannot name its owner.
const heartbeatBody = deviceTelemetrySchema;

/** Everything under /api/device. Authenticated by device credentials, never by Firebase user tokens. */
export function createDeviceRouter({ repos, logger, config = {} }) {
  const throttle = config.throttle ?? createFailureThrottle({ limit: config.failureLimit });
  const router = Router();

  router.use(express.json({ limit: '10kb' }));
  router.use(authenticateDevice({ devices: repos.devices, potters: repos.potters, throttle, logger }));
  router.use(deviceLimiter({ limit: config.perDeviceLimit }));

  router.post('/heartbeat', validate({ query: noQuery, body: heartbeatBody }), async (req, res) => {
    const { deviceId, potterId, pollIntervalSec } = req.device;
    await repos.devices.recordHeartbeat({ deviceId, potterId, telemetry: req.valid.body });
    res.json({ serverTime: new Date().toISOString(), pollIntervalSec });
  });

  return router;
}
