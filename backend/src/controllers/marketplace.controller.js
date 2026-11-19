import { ApiError } from '../utils/ApiError.js';
import { text } from '../db/schemas/common.js';
import { parseOrThrow } from '../utils/validate.js';

const idempotencyKeySchema = text(8, 128);

/** Thin HTTP layer for the storefront: public catalogue, the signed-in customer's own data, and orders. */
export function createMarketplaceController({ catalog, orders, repos }) {
  return {
    // ---- public catalogue ---------------------------------------------------------------------------------
    async listProducts(req, res) {
      res.json(await catalog.list(req.valid.query));
    },
    async getProduct(req, res) {
      res.json({ product: await catalog.get(req.valid.params.id) });
    },
    async categories(_req, res) {
      res.json({ items: await catalog.categories() });
    },
    async featuredPotters(_req, res) {
      res.json({ items: await catalog.featuredPotters() });
    },

    // ---- the signed-in customer (identity always comes from the verified token) --------------------------------
    async me(req, res) {
      res.json({ uid: req.user.uid, email: req.user.email, customer: await repos.customers.get(req.user.uid) });
    },
    async saveProfile(req, res) {
      res.json({ customer: await repos.customers.saveProfile(req.user.uid, req.valid.body, { email: req.user.email }) });
    },
    async addAddress(req, res) {
      res.status(201).json({ addresses: await repos.customers.addAddress(req.user.uid, req.valid.body) });
    },
    async updateAddress(req, res) {
      res.json({ addresses: await repos.customers.updateAddress(req.user.uid, req.valid.params.addressId, req.valid.body) });
    },
    async removeAddress(req, res) {
      res.json({ addresses: await repos.customers.removeAddress(req.user.uid, req.valid.params.addressId) });
    },
    async myOrders(req, res) {
      res.json(await orders.listMine(req.user.uid, req.valid.query));
    },

    // ---- orders --------------------------------------------------------------------------------------------
    async createOrder(req, res) {
      const result = await orders.place({ body: req.valid.body, idempotencyKey: req.idempotencyKey, uid: req.user?.uid ?? null });
      res.set('Cache-Control', 'no-store'); // the response carries a tracking token
      res.status(result.replayed ? 200 : 201).json(result.body);
    },
    async getOrder(req, res) {
      res.set('Cache-Control', 'no-store');
      res.json({ order: await orders.getForCaller(req.valid.params.id, { user: req.user, trackingToken: req.get('x-tracking-token') }) });
    },
  };
}

/** `Idempotency-Key` is mandatory on order creation: it is what makes a retried request safe. */
export function requireIdempotencyKey(req, _res, next) {
  try {
    const raw = req.get('idempotency-key');
    if (!raw) throw ApiError.badRequest('The Idempotency-Key header is required');
    req.idempotencyKey = parseOrThrow(idempotencyKeySchema, raw);
    next();
  } catch (err) {
    next(err);
  }
}
