import { ORDER_STATUS } from '../db/enums.js';

const sum = (values) => Object.values(values).reduce((a, b) => a + b, 0);

/**
 * Builds the dashboard summary from Firestore aggregation counts (see stats.repository.js).
 * Results are cached briefly so many open dashboards cannot multiply the read cost.
 *
 * Definitions (also shown in the UI):
 *  - devices.online  = active devices that contacted the server within `onlineWindowSec`
 *  - devices.offline = active devices that did not (including never seen)
 *  - products.total  = every product that has not been removed
 *  - orders.pending  = orders in status `pending`
 */
export function createDashboardService({ stats, onlineWindowSec, ttlMs = 15_000, clock = () => new Date() }) {
  let cache = null;
  let inflight = null;

  async function compute() {
    const now = clock();
    const raw = await stats.dashboardCounts({ onlineWindowSec, now });
    const active = raw.devices.active;
    const online = Math.min(raw.onlineDevices, active);
    return {
      generatedAt: now.toISOString(),
      counts: {
        potters: { total: sum(raw.potters), active: raw.potters.active, inactive: raw.potters.inactive },
        devices: {
          total: sum(raw.devices),
          online,
          offline: active - online,
          unassigned: raw.devices.unassigned,
          disabled: raw.devices.disabled,
          lost: raw.devices.lost,
          onlineWindowSec,
        },
        products: {
          total: sum(raw.products) - raw.products.removed,
          pendingApproval: raw.products.pending_review,
          byStatus: raw.products,
        },
        orders: {
          total: sum(raw.orders),
          pending: raw.orders.pending,
          needsAttention: raw.needsAttention,
          byStatus: Object.fromEntries(ORDER_STATUS.map((s) => [s, raw.orders[s]])),
        },
      },
      ordersByDay: raw.ordersByDay,
    };
  }

  async function getSummary() {
    if (cache && Date.now() - cache.at < ttlMs) return cache.value;
    inflight ??= compute()
      .then((value) => {
        cache = { value, at: Date.now() };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return { getSummary, invalidate: () => (cache = null) };
}
