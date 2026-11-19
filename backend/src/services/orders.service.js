import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** "01712345678" -> "01*******78": enough for a token holder to recognise their own number. */
const maskPhone = (phone) => (typeof phone === 'string' && phone.length >= 6 ? `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}` : null);

/**
 * Customer-facing order logic. A buyer may read an order only as its owner (verified uid), as a holder of the secret
 * tracking token, or as an admin; anyone else gets 404 so order IDs cannot be probed.
 */
export function createOrdersService({ repos, imageUrl }) {
  /** What a buyer sees. Never potter identity/contact, internal flags, notes, token hashes or idempotency keys. */
  function toCustomerOrder(order, { maskContact = false } = {}) {
    return {
      id: order.id,
      status: order.status,
      productId: order.productId,
      productName: order.productName,
      productImageUrl: imageUrl(order.productImagePath),
      quantity: order.quantity,
      listedPrice: order.listedPrice,
      negotiatedPrice: order.negotiatedPrice ?? null,
      courierName: order.courierName ?? null,
      trackingNumber: order.trackingNumber ?? null,
      delivery: {
        name: order.buyerName,
        phone: maskContact ? maskPhone(order.buyerPhone) : order.buyerPhone,
        address: order.deliveryAddress,
        district: order.deliveryDistrict ?? null,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async function timeline(orderId) {
    const { items } = await repos.orders.listHistory(orderId);
    return items.filter((h) => h.newStatus && h.newStatus !== h.previousStatus).map((h) => ({ status: h.newStatus, timestamp: h.timestamp }));
  }

  /** Places an order for a guest (`uid` null) or a signed-in customer. */
  async function place({ body, idempotencyKey, uid }) {
    if (uid && !(await repos.customers.get(uid))) {
      throw ApiError.conflict('Complete your profile before ordering', 'PROFILE_REQUIRED');
    }
    const trackingToken = randomBytes(24).toString('base64url');
    const { order, replayed } = await repos.orders.place({
      ...body,
      customerId: uid ?? null,
      idempotencyKey,
      trackingTokenHash: sha256(trackingToken),
    });
    return { replayed, body: { orderId: order.id, trackingToken, status: order.status, replayed } };
  }

  function tokenMatches(order, token) {
    if (!token || !order.trackingTokenHash) return false;
    const a = Buffer.from(sha256(token), 'hex');
    const b = Buffer.from(order.trackingTokenHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async function getForCaller(id, { user, trackingToken }) {
    const order = await repos.orders.get(id);
    const isAdmin = Boolean(user?.role);
    const isOwner = Boolean(user && order?.customerId && order.customerId === user.uid);
    const hasToken = Boolean(order) && tokenMatches(order, trackingToken);
    if (!order || !(isAdmin || isOwner || hasToken)) throw ApiError.notFound('Order not found');
    return { ...toCustomerOrder(order, { maskContact: !isAdmin && !isOwner }), timeline: await timeline(order.id) };
  }

  async function listMine(uid, { limit, cursor }) {
    const page = await repos.orders.listForCustomer(uid, { limit, cursor });
    return { items: page.items.map((o) => toCustomerOrder(o)), nextCursor: page.nextCursor };
  }

  return { place, getForCaller, listMine, toCustomerOrder };
}
