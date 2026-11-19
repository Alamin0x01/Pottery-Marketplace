import { z } from 'zod';
import { COLLECTIONS } from '../db/collections.js';
import { serialize, serverTimestamp } from '../db/timestamps.js';
import { CATEGORIES, PRODUCT_STATUS, PRODUCT_TRANSITIONS } from '../db/enums.js';
import { productUpdateSchema, rejectionReasonSchema } from '../db/schemas/products.js';
import { actor as actorSchema, potterId as potterIdSchema, text } from '../db/schemas/common.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';
import { buildSearchTokens } from '../utils/search.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';

const BATCH_SIZE = 400; // Firestore allows 500 writes per batch; keep headroom.
const statusSchema = z.enum(PRODUCT_STATUS);
const categorySchema = z.enum(CATEGORIES);
const SORTS = ['newest', 'price_asc', 'price_desc'];

export function createProductsRepository(db, { auditLogs }) {
  const col = db.collection(COLLECTIONS.products);
  const pottersCol = db.collection(COLLECTIONS.potters);

  const newId = () => col.doc().id;

  async function get(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    return serialize(await col.doc(id).get());
  }

  async function getOrThrow(id) {
    const product = await get(id);
    if (!product) throw ApiError.notFound('Product not found');
    return product;
  }

  async function getMany(ids) {
    const unique = [...new Set(ids)].filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id));
    if (unique.length === 0) return [];
    return (await db.getAll(...unique.map((id) => col.doc(id)))).map(serialize).filter(Boolean);
  }

  /**
   * Document for a new draft created from a device photo. `potter` must be the stored potter record
   * of the *authenticated device's owner*, so ownership and the denormalised seller fields can never
   * be chosen by the caller. Descriptive fields stay null until AI/admin fill them in.
   */
  function buildDraft({ potterId, potter, deviceId, images }) {
    return {
      potterId,
      deviceId,
      name: null,
      description: null,
      category: null,
      material: 'unknown',
      tags: [],
      price: null,
      suggestedPrice: null,
      images,
      imageUrl: null,
      stock: 1,
      status: 'draft',
      statusBeforeSuspend: null,
      aiStatus: 'queued',
      aiAttempts: 0,
      aiLeaseUntil: null,
      aiNextAttemptAt: serverTimestamp(),
      aiError: null,
      aiConfidence: null,
      aiFlags: [],
      rejectionReason: null,
      featured: false,
      potterName: potter.name,
      potterVillage: potter.village,
      potterDistrict: potter.district,
      searchTokens: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      approvedBy: null,
      approvedAt: null,
    };
  }

  /** Admin edit of descriptive fields. Search tokens are recomputed so they never go stale. */
  async function update(id, patch) {
    const data = parseOrThrow(productUpdateSchema, patch);
    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.notFound('Product not found');
      const current = snap.data();
      if (current.status === 'removed') throw ApiError.conflict('Removed products cannot be edited');
      if (current.status === 'approved' && data.price === null) {
        throw ApiError.conflict('An approved product must keep a price');
      }
      const merged = { ...current, ...data };
      tx.update(ref, { ...data, searchTokens: buildSearchTokens(merged), updatedAt: serverTimestamp() });
    });
    return getOrThrow(id);
  }

  /** Status change with an allowed-transition table; approval requires a complete listing. */
  async function transition(id, to, { actor, reason } = {}) {
    const next = parseOrThrow(statusSchema, to);
    const by = parseOrThrow(actorSchema, actor);

    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.notFound('Product not found');
      const current = snap.data();
      if (!PRODUCT_TRANSITIONS[current.status].includes(next)) {
        throw ApiError.conflict(`Cannot change a ${current.status} product to ${next}`);
      }

      const patch = { status: next, updatedAt: serverTimestamp() };
      if (next === 'approved') {
        const missing = ['name', 'description', 'category'].filter((k) => !current[k]);
        if (!Number.isInteger(current.price) || current.price < 1) missing.push('price');
        if (!(current.stock >= 1)) missing.push('stock');
        if (missing.length) {
          throw ApiError.badRequest(
            'Product is not ready for approval',
            missing.map((path) => ({ path, message: 'required before approval' })),
          );
        }
        Object.assign(patch, { approvedBy: by.id, approvedAt: serverTimestamp(), rejectionReason: null });
      } else {
        Object.assign(patch, { approvedBy: null, approvedAt: null });
      }
      if (next === 'rejected') patch.rejectionReason = parseOrThrow(rejectionReasonSchema, reason);

      tx.update(ref, patch);
      auditLogs.write(tx, {
        actor: by,
        action: `product.${next}`,
        target: { collection: COLLECTIONS.products, id },
        before: { status: current.status },
        after: { status: next },
      });
    });
    return getOrThrow(id);
  }

  async function commitInChunks(docs, apply) {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const doc of docs.slice(i, i + BATCH_SIZE)) apply(batch, doc);
      await batch.commit();
    }
  }

  /** Hides a deactivated potter's public products. Idempotent: safe to repeat. */
  async function suspendAllForPotter(potterId) {
    const pId = parseOrThrow(potterIdSchema, potterId);
    const { docs } = await col.where('potterId', '==', pId).where('status', '==', 'approved').get();
    await commitInChunks(docs, (batch, doc) =>
      batch.update(doc.ref, { status: 'suspended', statusBeforeSuspend: 'approved', updatedAt: serverTimestamp() }),
    );
    return docs.length;
  }

  /** Restores products hidden by `suspendAllForPotter` to their previous status. Idempotent. */
  async function restoreAllForPotter(potterId) {
    const pId = parseOrThrow(potterIdSchema, potterId);
    const { docs } = await col.where('potterId', '==', pId).where('status', '==', 'suspended').get();
    await commitInChunks(docs, (batch, doc) =>
      batch.update(doc.ref, {
        status: doc.data().statusBeforeSuspend ?? 'pending_review',
        statusBeforeSuspend: null,
        updatedAt: serverTimestamp(),
      }),
    );
    return docs.length;
  }

  /** Re-copies the potter's public-safe fields onto their products after a profile edit. */
  async function refreshPotterSnapshot(potterId) {
    const pId = parseOrThrow(potterIdSchema, potterId);
    const potterSnap = await pottersCol.doc(pId).get();
    if (!potterSnap.exists) return 0;
    const { name, village, district } = potterSnap.data();
    const { docs } = await col.where('potterId', '==', pId).get();
    const stale = docs.filter((d) => {
      const p = d.data();
      return p.potterName !== name || p.potterVillage !== village || p.potterDistrict !== district;
    });
    await commitInChunks(stale, (batch, doc) =>
      batch.update(doc.ref, { potterName: name, potterVillage: village, potterDistrict: district, updatedAt: serverTimestamp() }),
    );
    return stale.length;
  }

  /**
   * Lists products using only declared query shapes (see db/queryShapes.js), so every query has an index.
   * A price filter orders by price (ascending unless sort=price_desc). Unsupported combinations are a 400.
   */
  async function list({ status, category, potterId, featured, searchToken, sort = 'newest', minPrice, maxPrice, limit, cursor } = {}) {
    if (!SORTS.includes(sort)) throw ApiError.badRequest(`sort must be one of ${SORTS.join(', ')}`);

    const equals = [];
    const filters = {};
    const add = (field, value) => {
      equals.push(field);
      filters[field] = value;
    };
    if (status !== undefined) add('status', parseOrThrow(statusSchema, status));
    if (category !== undefined) add('category', parseOrThrow(categorySchema, category));
    if (potterId !== undefined) add('potterId', parseOrThrow(potterIdSchema, potterId));
    if (featured !== undefined) add('featured', featured === true);

    let arrayContains = null;
    if (searchToken !== undefined) {
      arrayContains = 'searchTokens';
      filters.searchTokens = parseOrThrow(text(2, 30), searchToken).toLowerCase();
    }

    const hasRange = minPrice != null || maxPrice != null;
    for (const [label, v] of [['minPrice', minPrice], ['maxPrice', maxPrice]]) {
      if (v != null && (!Number.isInteger(v) || v < 0)) throw ApiError.badRequest(`${label} must be a non-negative integer`);
    }
    const effectiveSort = hasRange && sort === 'newest' ? 'price_asc' : sort;

    const shape = findShape(COLLECTIONS.products, { equals, arrayContains, sort: effectiveSort });
    const range = hasRange ? { field: 'price', min: minPrice, max: maxPrice } : null;
    return runShape(db, shape, { filters, range, limit, cursor });
  }

  return { newId, get, getOrThrow, getMany, buildDraft, update, transition, suspendAllForPotter, restoreAllForPotter, refreshPotterSnapshot, list };
}
