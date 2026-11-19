import { Router } from 'express';

export function createHealthRouter({ readiness } = {}) {
  const router = Router();

  // Liveness: process is up. No dependencies are touched.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
  });

  // Readiness: Firestore, Storage and Auth are reachable. Results are cached by the probe.
  router.get('/health/ready', async (_req, res, next) => {
    try {
      if (!readiness) {
        return res.status(503).json({ status: 'unavailable', reason: 'firebase_not_configured' });
      }
      const result = await readiness();
      res.status(result.ok ? 200 : 503).json({ status: result.ok ? 'ready' : 'unavailable', checks: result.checks });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
