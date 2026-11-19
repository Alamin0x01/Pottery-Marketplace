import { toAdminPotter } from '../utils/serializers.js';
import { withConnectivity } from '../utils/connectivity.js';

export function createPottersService({ repos, onlineWindowSec, clock = () => new Date() }) {
  const view = (potter) => toAdminPotter(potter);

  return {
    register: async (input, actor) => view(await repos.potters.create(input, { createdBy: actor.id })),

    async list({ q, status, district, limit, cursor }) {
      const page = q ? await repos.potters.search({ q, status, district }) : await repos.potters.list({ status, district, limit, cursor });
      return { items: page.items.map(view), nextCursor: page.nextCursor, truncated: page.truncated ?? false };
    },

    /** Profile = the potter, all of their devices (secrets never included) and index-only counts. */
    async profile(id) {
      const potter = await repos.potters.getOrThrow(id);
      const [devices, counts] = await Promise.all([repos.devices.listByPotter(id), repos.stats.potterCounts(id)]);
      const now = clock();
      return { potter: view(potter), devices: devices.map((d) => withConnectivity(d, { onlineWindowSec, now })), counts };
    },

    update: async (id, patch, actor) => view(await repos.potters.update(id, patch, { actor })),
    setStatus: async (id, status, actor) => view(await repos.potters.setStatus(id, status, actor)),
  };
}
