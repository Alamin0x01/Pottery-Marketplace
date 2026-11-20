import { toAdminOrder, toAdminProduct } from '../utils/serializers.js';

/** Thin HTTP layer for /api/admin: reads validated input from `req.valid`, delegates, shapes the response. */
export function createAdminController({ repos, services }) {
  return {
    // The identity here comes from the verified token (req.user), never from the request.
    async me(req, res) {
      const profile = await repos.admins.get(req.user.uid);
      res.json({
        uid: req.user.uid,
        email: req.user.email,
        role: req.user.role,
        name: profile?.name ?? null,
        active: profile?.active ?? true,
        demo: req.user.demo === true,
      });
    },

    async dashboard(_req, res) {
      res.json(await services.dashboard.getSummary());
    },

    async activity(req, res) {
      const { items } = await repos.auditLogs.listRecent({ limit: req.valid.query.limit });
      const targets = (collection) => items.filter((i) => i.target.collection === collection).map((i) => i.target.id);
      const [admins, potters, products] = await Promise.all([
        repos.admins.getMany([...items.filter((i) => i.actor.type === 'admin').map((i) => i.actor.id), ...targets('admins')]),
        repos.potters.getMany(targets('potters')),
        repos.products.getMany(targets('products')),
      ]);
      const adminNames = new Map(admins.map((a) => [a.id, a.name]));
      // Friendly labels so the feed reads "approved product Clay Pot" instead of showing raw IDs.
      const labels = {
        admins: (id) => adminNames.get(id) ?? null,
        potters: (id) => {
          const p = potters.find((x) => x.id === id);
          return p ? `${p.name} (${p.id})` : null;
        },
        products: (id) => {
          const p = products.find((x) => x.id === id);
          return p ? (p.name ?? 'Untitled draft') : null;
        },
      };
      res.json({
        items: items.map((i) => ({
          id: i.id,
          timestamp: i.timestamp,
          action: i.action,
          actor: { type: i.actor.type, id: i.actor.id, name: adminNames.get(i.actor.id) ?? null },
          target: { ...i.target, label: labels[i.target.collection]?.(i.target.id) ?? null },
        })),
      });
    },

    async orders(req, res) {
      const { needsAttention, ...rest } = req.valid.query;
      const page = await repos.orders.list({
        ...rest,
        ...(needsAttention !== undefined && { needsAdminAttention: needsAttention === 'true' }),
      });
      res.json({ items: page.items.map(toAdminOrder), nextCursor: page.nextCursor });
    },

    async products(req, res) {
      const page = await repos.products.list(req.valid.query);
      res.json({ items: page.items.map(toAdminProduct), nextCursor: page.nextCursor });
    },

    async search(req, res) {
      res.json(await services.search.search(req.valid.query.q));
    },

    async admins(req, res) {
      const page = await repos.admins.list(req.valid.query);
      res.json({ items: page.items, nextCursor: page.nextCursor });
    },
  };
}
