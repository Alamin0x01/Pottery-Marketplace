import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { createHealthRouter } from './routes/health.routes.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createDeviceRouter } from './routes/device/index.js';
import { createMarketplaceRouters } from './routes/marketplace.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** `auth` (Firebase Admin Auth) and `repos` are optional so the app can still run health checks without Firebase. */
export function createApp({ env, logger, readiness, auth, repos, adminConfig = {}, deviceConfig = {}, marketplaceConfig = {} }) {
  const app = express();

  app.disable('x-powered-by');
  // Behind the Vercel/VPS reverse proxy; must be set correctly or rate limits see the proxy IP.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients (devices, curl) send no Origin header; browsers must be allow-listed.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('CORS_ORIGIN_NOT_ALLOWED'));
      },
    }),
  );

  // Device routes sit BEFORE the per-IP limiter: cellular devices share carrier-grade-NAT addresses, so they are
  // limited per authenticated device (and per failed attempt) instead.
  if (repos) app.use('/api/device', createDeviceRouter({ repos, logger, config: deviceConfig }));

  // Coarse per-IP limit for public routes.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  const healthRouter = createHealthRouter({ readiness });
  app.use(healthRouter);
  app.use('/api', healthRouter);

  if (auth && repos) {
    app.use(
      '/api/admin',
      createAdminRouter({ auth, repos, logger, config: { onlineWindowSec: env.DEVICE_ONLINE_WINDOW_SEC, ...adminConfig } }),
    );
    const { publicRouter, customerRouter, ordersRouter } = createMarketplaceRouters({ auth, repos, logger, env, config: marketplaceConfig });
    app.use('/api', publicRouter);
    app.use('/api/customers', customerRouter);
    app.use('/api/orders', ordersRouter);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
