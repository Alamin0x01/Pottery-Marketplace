import { COLLECTIONS } from '../db/collections.js';
import { serialize, serverTimestamp, timestampAfter } from '../db/timestamps.js';
import { notificationCreateSchema } from '../db/schemas/orders.js';
import { deviceId as deviceIdSchema } from '../db/schemas/common.js';
import { notificationDocId, ID_PATTERNS } from '../utils/ids.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createNotificationsRepository(db) {
  const col = db.collection(COLLECTIONS.notifications);
  const ordersCol = db.collection(COLLECTIONS.orders);
  const devicesCol = db.collection(COLLECTIONS.devices);

  async function get(id) {
    if (!ID_PATTERNS.notification.test(id)) return null;
    return serialize(await col.doc(id).get());
  }

  /**
   * Creates a notification for a device. The potter is taken from the order, and the target device must be an
   * active device of that same potter. The document ID is deterministic (`{orderId}_{type}`), so repeating
   * the call returns the existing notification instead of creating a duplicate.
   */
  async function create(input, { ttlDays = 7 } = {}) {
    const { orderId, deviceId, type } = parseOrThrow(notificationCreateSchema, input);
    const id = notificationDocId(orderId, type);

    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const [existing, orderSnap, deviceSnap] = await tx.getAll(ref, ordersCol.doc(orderId), devicesCol.doc(deviceId));
      if (existing.exists) return;
      if (!orderSnap.exists) throw ApiError.notFound('Order not found');
      if (!deviceSnap.exists) throw ApiError.notFound('Device not found');

      const potterId = orderSnap.data().potterId;
      const device = deviceSnap.data();
      if (device.potterId !== potterId || device.status !== 'active') {
        throw ApiError.conflict('Device is not an active device of the order\'s potter');
      }
      tx.create(ref, {
        deviceId,
        potterId,
        orderId,
        type,
        status: 'pending',
        deliveryCount: 0,
        firstDeliveredAt: null,
        lastDeliveredAt: null,
        acknowledgedAt: null,
        expiresAt: timestampAfter(ttlDays * DAY_MS),
        createdAt: serverTimestamp(),
      });
    });
    return get(id);
  }

  /**
   * Marks a notification as seen by the device. Returns null when the notification does not exist OR belongs
   * to another device (callers answer 404 in both cases so IDs cannot be probed). Idempotent.
   * "Acknowledged" means the potter saw it — it is not order acceptance.
   */
  async function acknowledge({ notificationId, deviceId }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    if (!ID_PATTERNS.notification.test(notificationId)) return null;
    const ref = col.doc(notificationId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().deviceId !== dId) return null;
      if (snap.data().status === 'pending' || snap.data().status === 'delivered') {
        tx.update(ref, { status: 'acknowledged', acknowledgedAt: serverTimestamp() });
        return { ...serialize(snap), status: 'acknowledged' };
      }
      return serialize(snap);
    });
  }

  /** Unacknowledged, unexpired notifications of one device, oldest first (the device poll). */
  async function listUnacknowledgedForDevice(deviceId, { limit = 5 } = {}) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const { docs } = await col
      .where('deviceId', '==', dId)
      .where('status', 'in', ['pending', 'delivered'])
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();
    const now = Date.now();
    return docs.map(serialize).filter((n) => Date.parse(n.expiresAt) > now);
  }

  return { get, create, acknowledge, listUnacknowledgedForDevice };
}
