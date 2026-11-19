import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../db/collections.js';
import { POTTER_STATUS, DEVICE_STATUS, PRODUCT_STATUS, ORDER_STATUS, TERMINAL_ORDER_STATUS } from '../db/enums.js';
import { dhakaDayRanges } from '../utils/dhakaDays.js';

const OPEN_ORDER_STATUS = ORDER_STATUS.filter((s) => !TERMINAL_ORDER_STATUS.includes(s));

const countOf = async (query) => (await query.count().get()).data().count;

/**
 * Dashboard numbers computed with Firestore `count()` aggregation queries, which read index entries
 * only (no documents are downloaded), so cost stays tiny even with thousands of records.
 */
export function createStatsRepository(db) {
  const col = (name) => db.collection(COLLECTIONS[name]);

  async function byStatus(collection, statuses) {
    const entries = await Promise.all(statuses.map(async (s) => [s, await countOf(col(collection).where('status', '==', s))]));
    return Object.fromEntries(entries);
  }

  async function dashboardCounts({ onlineWindowSec, now = new Date(), days = 14 }) {
    const onlineSince = Timestamp.fromMillis(now.getTime() - onlineWindowSec * 1000);
    const [potters, devices, onlineDevices, products, orders, needsAttention, ordersByDay] = await Promise.all([
      byStatus('potters', POTTER_STATUS),
      byStatus('devices', DEVICE_STATUS),
      countOf(col('devices').where('status', '==', 'active').where('lastSeen', '>=', onlineSince)),
      byStatus('products', PRODUCT_STATUS),
      byStatus('orders', ORDER_STATUS),
      countOf(col('orders').where('needsAdminAttention', '==', true)),
      Promise.all(
        dhakaDayRanges(now, days).map(async ({ date, start, end }) => ({
          date,
          count: await countOf(
            col('orders').where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end)),
          ),
        })),
      ),
    ]);
    return { potters, devices, onlineDevices, products, orders, needsAttention, ordersByDay };
  }

  /** Counts for one potter's profile page (index-only count queries; products exclude nothing, orders by status group). */
  async function potterCounts(potterId) {
    const [devices, products, orders, openOrders] = await Promise.all([
      countOf(col('devices').where('potterId', '==', potterId)),
      countOf(col('products').where('potterId', '==', potterId)),
      countOf(col('orders').where('potterId', '==', potterId)),
      countOf(col('orders').where('potterId', '==', potterId).where('status', 'in', OPEN_ORDER_STATUS)),
    ]);
    return { devices, products, orders, openOrders };
  }

  /** Public catalogue figures (approved products only). */
  async function approvedProductsByCategory(categories) {
    const entries = await Promise.all(
      categories.map(async (c) => [c, await countOf(col('products').where('status', '==', 'approved').where('category', '==', c))]),
    );
    return Object.fromEntries(entries);
  }

  const approvedProductsForPotter = (potterId) =>
    countOf(col('products').where('status', '==', 'approved').where('potterId', '==', potterId));

  return { dashboardCounts, potterCounts, approvedProductsByCategory, approvedProductsForPotter };
}
