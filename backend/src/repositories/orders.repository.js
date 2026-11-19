import { createHash } from 'node:crypto';
import { COLLECTIONS } from '../db/collections.js';
import { serialize, serverTimestamp } from '../db/timestamps.js';
import { TERMINAL_ORDER_STATUS } from '../db/enums.js';
import { orderCreateSchema } from '../db/schemas/orders.js';
import { actor as actorSchema, docId } from '../db/schemas/common.js';
import { generateOrderId, ID_PATTERNS } from '../utils/ids.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';

const LIST_FILTERS = ['potterId', 'status', 'customerId', 'needsAdminAttention'];
export const DUPLICATE_WINDOW_MS = 10 * 60_000;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function createOrdersRepository(db) {
  const col = db.collection(COLLECTIONS.orders);
  const historyCol = db.collection(COLLECTIONS.orderHistory);
  const productsCol = db.collection(COLLECTIONS.products);
  const pottersCol = db.collection(COLLECTIONS.potters);
  const customersCol = db.collection(COLLECTIONS.customers);
  const keysCol = db.collection(COLLECTIONS.idempotencyKeys);

  async function get(id) {
    if (!ID_PATTERNS.order.test(id)) return null;
    return serialize(await col.doc(id).get());
  }

  /**
   * Places an order request. EVERYTHING happens in one transaction, so a failure leaves no partial state:
   *
   *  - idempotency: `idempotency_keys/{sha256(phone:key)}` maps to the order. A replay (same key and phone) returns the
   *    existing order (`replayed: true`) and swaps in the new tracking-token hash, so a buyer whose first response
   *    was lost can still track it. A replay with a different product/quantity is `409 IDEMPOTENCY_MISMATCH`.
   *  - duplicate guard: the same phone ordering the same product again within 10 minutes under a different key is
   *    `409 DUPLICATE_ORDER` while the earlier order is still open (`dup_…` lock document).
   *  - the potter, price and product snapshot come from the stored product, never from the caller.
   *  - stock is RESERVED: the product's `stock` is reduced by the quantity, so two buyers can never be promised the
   *    same last piece. Cancelling the order returns it (see `cancel`).
   *  - the order and its first `order_history` row are created together.
   * Notification creation for the potter's device is added in Phase 9 on top of this.
   */
  async function place(input, { duplicateWindowMs = DUPLICATE_WINDOW_MS } = {}) {
    const data = parseOrThrow(orderCreateSchema, input);
    const orderId = generateOrderId();
    const idemRef = keysCol.doc(sha256(`${data.buyerPhone}:${data.idempotencyKey}`));
    const dupRef = keysCol.doc(`dup_${sha256(`${data.buyerPhone}:${data.productId}`)}`);
    let outcome;

    await db.runTransaction(async (tx) => {
      const productRef = productsCol.doc(data.productId);
      const refs = [idemRef, dupRef, productRef];
      if (data.customerId) refs.push(customersCol.doc(data.customerId));
      const [idemSnap, dupSnap, productSnap, customerSnap] = await tx.getAll(...refs);

      if (idemSnap.exists) {
        const existingRef = col.doc(idemSnap.data().orderId);
        const existing = await tx.get(existingRef);
        if (!existing.exists) throw ApiError.conflict('Order no longer exists', 'IDEMPOTENCY_MISMATCH');
        const prior = existing.data();
        if (prior.productId !== data.productId || prior.quantity !== data.quantity) {
          throw ApiError.conflict('This Idempotency-Key was already used for a different order', 'IDEMPOTENCY_MISMATCH');
        }
        tx.update(existingRef, { trackingTokenHash: data.trackingTokenHash });
        outcome = { id: existing.id, replayed: true };
        return;
      }

      if (!productSnap.exists || productSnap.data().status !== 'approved') throw ApiError.notFound('Product not available');
      const product = productSnap.data();
      if (data.customerId && !customerSnap.exists) throw ApiError.badRequest('Unknown customer');

      const potterSnap = await tx.get(pottersCol.doc(product.potterId));
      if (!potterSnap.exists || potterSnap.data().status !== 'active') throw ApiError.conflict('Seller is not active');
      if (!(product.stock >= data.quantity)) {
        throw ApiError.conflict(product.stock > 0 ? `Only ${product.stock} left in stock` : 'This product is sold out', 'INSUFFICIENT_STOCK');
      }

      if (duplicateWindowMs > 0 && dupSnap.exists && dupSnap.data().createdAt) {
        const age = Date.now() - dupSnap.data().createdAt.toMillis();
        if (age < duplicateWindowMs) {
          const previous = await tx.get(col.doc(dupSnap.data().orderId));
          if (previous.exists && !TERMINAL_ORDER_STATUS.includes(previous.data().status)) {
            throw ApiError.conflict('You already placed an order for this product a moment ago', 'DUPLICATE_ORDER');
          }
        }
      }

      const web = product.images?.find((i) => i.kind === 'web') ?? product.images?.find((i) => i.kind === 'thumb');
      tx.create(idemRef, { orderId, createdAt: serverTimestamp() });
      if (duplicateWindowMs > 0) tx.set(dupRef, { orderId, createdAt: serverTimestamp() });
      tx.update(productRef, { stock: product.stock - data.quantity, updatedAt: serverTimestamp() });
      tx.create(col.doc(orderId), {
        productId: data.productId,
        potterId: product.potterId,
        customerId: data.customerId,
        trackingTokenHash: data.trackingTokenHash,
        idempotencyKey: data.idempotencyKey,
        buyerName: data.buyerName,
        buyerPhone: data.buyerPhone,
        deliveryAddress: data.deliveryAddress,
        deliveryDistrict: data.deliveryDistrict,
        productName: product.name,
        productImagePath: web?.path ?? null,
        quantity: data.quantity,
        listedPrice: product.price,
        negotiatedPrice: null,
        status: 'pending',
        courierName: null,
        trackingNumber: null,
        needsAdminAttention: false,
        attentionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.create(historyCol.doc(), {
        orderId,
        previousStatus: null,
        newStatus: 'pending',
        previousPrice: null,
        negotiatedPrice: null,
        note: null,
        updatedBy: { type: 'system', id: 'checkout' },
        timestamp: serverTimestamp(),
      });
      outcome = { id: orderId, replayed: false };
    }, { maxAttempts: 25 }); // popular products make concurrent buyers contend on one stock counter
    return { order: await get(outcome.id), replayed: outcome.replayed };
  }

  /** Fixture/script helper: like `place` without the 10-minute duplicate guard; returns just the order. */
  async function createWithHistory(input) {
    return (await place(input, { duplicateWindowMs: 0 })).order;
  }

  /**
   * Cancels an open order and returns its reserved units to the product's stock, with a history row, atomically.
   * (Wired to the admin order-management UI in Phase 7.)
   */
  async function cancel(orderId, { actor, note = null } = {}) {
    const by = parseOrThrow(actorSchema, actor);
    if (!ID_PATTERNS.order.test(orderId)) throw ApiError.notFound('Order not found');
    await db.runTransaction(async (tx) => {
      const ref = col.doc(orderId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.notFound('Order not found');
      const order = snap.data();
      if (TERMINAL_ORDER_STATUS.includes(order.status)) throw ApiError.conflict(`A ${order.status} order cannot be cancelled`);
      const productRef = productsCol.doc(order.productId);
      const productSnap = await tx.get(productRef);

      tx.update(ref, { status: 'cancelled', updatedAt: serverTimestamp() });
      if (productSnap.exists) tx.update(productRef, { stock: productSnap.data().stock + order.quantity, updatedAt: serverTimestamp() });
      tx.create(historyCol.doc(), {
        orderId,
        previousStatus: order.status,
        newStatus: 'cancelled',
        previousPrice: order.negotiatedPrice,
        negotiatedPrice: order.negotiatedPrice,
        note,
        updatedBy: by,
        timestamp: serverTimestamp(),
      });
    });
    return get(orderId);
  }

  /** Exactly the filter combinations declared in db/queryShapes.js are supported. */
  async function list(filters = {}) {
    const { limit, cursor, ...rest } = filters;
    const equals = LIST_FILTERS.filter((f) => rest[f] !== undefined);
    return runShape(db, findShape(COLLECTIONS.orders, { equals }), { filters: rest, limit, cursor });
  }

  /** One customer's orders, newest first. `uid` must be the verified caller's uid. */
  function listForCustomer(uid, { limit, cursor } = {}) {
    return list({ customerId: parseOrThrow(docId, uid), limit, cursor });
  }

  async function listHistory(orderId, { limit = 100, cursor } = {}) {
    if (!ID_PATTERNS.order.test(orderId)) throw ApiError.notFound('Order not found');
    return runShape(db, findShape(COLLECTIONS.orderHistory, { equals: ['orderId'] }), {
      filters: { orderId },
      limit,
      cursor,
    });
  }

  return { get, place, createWithHistory, cancel, list, listForCustomer, listHistory };
}
