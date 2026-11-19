import { Router } from 'express';
import { authenticateUser, optionalUser } from '../middleware/authUser.js';
import { validate } from '../middleware/validate.js';
import { adminFailureLimiter, orderIpLimiter, orderPhoneLimiter, userLimiter } from '../middleware/rateLimit.js';
import { createMarketplaceController, requireIdempotencyKey } from '../controllers/marketplace.controller.js';
import { createCatalogService } from '../services/catalog.service.js';
import { createOrdersService } from '../services/orders.service.js';
import { createPublicImageUrl } from '../utils/publicUrl.js';
import { BD_DISTRICTS } from '../utils/districts.js';
import {
  addressBody, addressParams, addressPatchBody, listQuery, noQuery, orderBody, orderParams, productParams, productsQuery, profileBody,
} from '../validators/marketplace.validators.js';

/**
 * Storefront routers:
 *   /api/products, /api/categories, /api/potters   public, read-only, allow-listed payloads
 *   /api/customers                                  signed-in customer only (own data)
 *   /api/orders                                     guests and customers; reads need owner / tracking token / admin
 */
export function createMarketplaceRouters({ auth, repos, logger, env, config = {} }) {
  const imageUrl = createPublicImageUrl({ bucket: env.FIREBASE_STORAGE_BUCKET, emulatorHost: env.FIREBASE_STORAGE_EMULATOR_HOST });
  const catalog = createCatalogService({ repos, imageUrl, cacheMs: config.catalogCacheMs });
  const orders = createOrdersService({ repos, imageUrl });
  const c = createMarketplaceController({ catalog, orders, repos });

  const publicRouter = Router();
  publicRouter.get('/products', validate({ query: productsQuery }), c.listProducts);
  publicRouter.get('/products/:id', validate({ params: productParams, query: noQuery }), c.getProduct);
  publicRouter.get('/categories', validate({ query: noQuery }), c.categories);
  publicRouter.get('/potters/featured', validate({ query: noQuery }), c.featuredPotters);
  publicRouter.get('/districts', validate({ query: noQuery }), (_req, res) => res.json({ items: BD_DISTRICTS }));

  const customerRouter = Router();
  customerRouter.use(adminFailureLimiter({ limit: config.failureLimit }));
  customerRouter.use(authenticateUser({ auth, logger }));
  customerRouter.use(userLimiter({ limit: config.perUserLimit }));
  customerRouter.get('/me', validate({ query: noQuery }), c.me);
  customerRouter.patch('/me', validate({ query: noQuery, body: profileBody }), c.saveProfile);
  customerRouter.get('/me/orders', validate({ query: listQuery }), c.myOrders);
  customerRouter.post('/me/addresses', validate({ query: noQuery, body: addressBody }), c.addAddress);
  customerRouter.patch('/me/addresses/:addressId', validate({ params: addressParams, query: noQuery, body: addressPatchBody }), c.updateAddress);
  customerRouter.delete('/me/addresses/:addressId', validate({ params: addressParams, query: noQuery }), c.removeAddress);

  const ordersRouter = Router();
  ordersRouter.post(
    '/',
    orderIpLimiter({ limit: config.orderIpLimit }),
    requireIdempotencyKey,
    optionalUser({ auth, logger }),
    validate({ query: noQuery, body: orderBody }),
    orderPhoneLimiter({ limit: config.orderPhoneLimit }),
    c.createOrder,
  );
  ordersRouter.get('/:id', adminFailureLimiter({ limit: config.failureLimit }), optionalUser({ auth, logger }), validate({ params: orderParams, query: noQuery }), c.getOrder);

  return { publicRouter, customerRouter, ordersRouter };
}
