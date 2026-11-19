import { ID_PATTERNS } from '../utils/ids.js';

const HINT = 'Search by Potter ID (POT-1001), Device ID (DEV-001) or Order ID (ORD-XXXXXXXXXX).';

/** Exact-ID lookup across potters, devices and orders (the entities that have human-quotable IDs). */
export function createSearchService({ repos }) {
  async function search(rawQuery) {
    const q = rawQuery.trim().toUpperCase();
    const found = [];

    if (ID_PATTERNS.potter.test(q)) {
      const p = await repos.potters.get(q);
      if (p) {
        found.push({ type: 'potter', id: p.id, title: p.name, subtitle: `${p.village}, ${p.district}`, status: p.status, path: `/potters/${p.id}` });
      }
    } else if (ID_PATTERNS.device.test(q)) {
      const d = await repos.devices.get(q); // never includes the credential hash
      if (d) {
        found.push({ type: 'device', id: d.id, title: d.id, subtitle: d.potterId ? `Owner ${d.potterId}` : 'Unassigned', status: d.status, path: `/devices/${d.id}` });
      }
    } else if (ID_PATTERNS.order.test(q)) {
      const o = await repos.orders.get(q);
      if (o) {
        found.push({ type: 'order', id: o.id, title: o.productName ?? o.id, subtitle: `${o.buyerName} · qty ${o.quantity}`, status: o.status, path: `/orders?id=${o.id}` });
      }
    } else {
      return { results: [], hint: HINT };
    }
    return { results: found, hint: found.length === 0 ? 'No record with that ID.' : null };
  }
  return { search };
}
