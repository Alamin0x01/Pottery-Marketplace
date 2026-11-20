import { Router } from 'express';
import { ADMIN_ROLES } from '../../db/enums.js';
import { authenticateUser } from '../../middleware/authUser.js';
import { requireRole } from '../../middleware/requireRole.js';
import { denyDemo } from '../../middleware/denyDemo.js';
import { validate } from '../../middleware/validate.js';
import { adminFailureLimiter, adminLimiter } from '../../middleware/rateLimit.js';
import { createAdminController } from '../../controllers/admin.controller.js';
import { createManagementController } from '../../controllers/management.controller.js';
import { createDashboardService } from '../../services/dashboard.service.js';
import { createSearchService } from '../../services/search.service.js';
import { createPottersService } from '../../services/potters.service.js';
import { createDevicesService } from '../../services/devices.service.js';
import {
  activityQuery,
  deviceAssignBody,
  deviceParams,
  deviceRegisterBody,
  deviceRevokeBody,
  devicesQuery,
  deviceStatusBody,
  emptyBody,
  listQuery,
  noQuery,
  ordersQuery,
  potterBody,
  potterParams,
  potterPatchBody,
  pottersQuery,
  potterStatusBody,
  productsQuery,
  searchQuery,
} from '../../validators/admin.validators.js';

/**
 * Everything under /api/admin. Order of the stack matters:
 *   failure limiter -> verify Firebase ID token -> require an admin role claim -> per-admin limiter -> route
 * so no handler below can run for an unauthenticated or non-admin caller.
 */
export function createAdminRouter({ auth, repos, logger, config }) {
  const services = {
    dashboard: createDashboardService({ stats: repos.stats, onlineWindowSec: config.onlineWindowSec }),
    search: createSearchService({ repos }),
    potters: createPottersService({ repos, onlineWindowSec: config.onlineWindowSec }),
    devices: createDevicesService({ repos, onlineWindowSec: config.onlineWindowSec }),
  };
  const c = createAdminController({ repos, services });
  const m = createManagementController({ services, onlineWindowSec: config.onlineWindowSec });

  const router = Router();
  router.use(adminFailureLimiter({ limit: config.failureLimit }));
  router.use(authenticateUser({ auth, logger }));
  router.use(requireRole(...ADMIN_ROLES));
  router.use(adminLimiter({ limit: config.perAdminLimit }));

  router.get('/me', validate({ query: noQuery }), c.me);
  router.get('/dashboard', validate({ query: noQuery }), c.dashboard);
  router.get('/activity', validate({ query: activityQuery }), c.activity);
  router.get('/orders', validate({ query: ordersQuery }), c.orders);
  router.get('/products', validate({ query: productsQuery }), c.products);
  router.get('/search', validate({ query: searchQuery }), c.search);
  router.get('/admins', requireRole('superadmin'), validate({ query: listQuery }), c.admins);
  router.get('/meta', validate({ query: noQuery }), m.meta);

  router.post('/potters', validate({ query: noQuery, body: potterBody }), m.createPotter);
  router.get('/potters', validate({ query: pottersQuery }), m.listPotters);
  router.get('/potters/:id', validate({ params: potterParams, query: noQuery }), m.getPotter);
  router.patch('/potters/:id', validate({ params: potterParams, query: noQuery, body: potterPatchBody }), m.updatePotter);
  router.patch('/potters/:id/status', denyDemo, validate({ params: potterParams, query: noQuery, body: potterStatusBody }), m.setPotterStatus);

  router.post('/devices', validate({ query: noQuery, body: deviceRegisterBody }), m.registerDevice);
  router.get('/devices', validate({ query: devicesQuery }), m.listDevices);
  router.post('/devices/assign', validate({ query: noQuery, body: deviceAssignBody }), m.assignDevice);
  router.get('/devices/:id', validate({ params: deviceParams, query: noQuery }), m.getDevice);
  router.get('/devices/:id/events', validate({ params: deviceParams, query: listQuery }), m.deviceEvents);
  router.get('/devices/:id/audit', validate({ params: deviceParams, query: listQuery }), m.deviceAudit);
  router.patch('/devices/:id/status', denyDemo, validate({ params: deviceParams, query: noQuery, body: deviceStatusBody }), m.setDeviceStatus);
  router.post('/devices/:id/revoke', denyDemo, validate({ params: deviceParams, query: noQuery, body: deviceRevokeBody }), m.revokeDevice);
  router.post('/devices/:id/credentials', denyDemo, validate({ params: deviceParams, query: noQuery, body: emptyBody }), m.issueCredentials);

  return router;
}
