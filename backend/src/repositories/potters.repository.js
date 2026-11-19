import { FieldPath } from 'firebase-admin/firestore';
import { COLLECTIONS, COUNTER_NAMES } from '../db/collections.js';
import { serialize, serverTimestamp } from '../db/timestamps.js';
import { potterCreateSchema, potterUpdateSchema, potterStatusSchema } from '../db/schemas/potters.js';
import { actor as actorSchema, docId, district as districtSchema } from '../db/schemas/common.js';
import { formatPotterId, ID_PATTERNS } from '../utils/ids.js';
import { normalizeBdPhone } from '../utils/phone.js';
import { buildSearchTokens } from '../utils/search.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';
import { COUNTER_TX_ATTEMPTS } from './counters.repository.js';

const duplicatePhone = () => ApiError.conflict('A potter with this phone number is already registered', 'DUPLICATE_PHONE');
const SEARCH_CAP = 50;

// Derived, search-only fields (Firestore has no text search): lower-case name for prefix queries, word tokens for any-word queries.
const searchFields = ({ name, village }) => ({
  nameLower: name.toLowerCase(),
  searchTokens: buildSearchTokens({ name, tags: [village] }),
});

export function createPottersRepository(db, { counters, auditLogs, products }) {
  const col = db.collection(COLLECTIONS.potters);
  const phones = db.collection(COLLECTIONS.potterPhones);

  async function get(id) {
    if (!ID_PATTERNS.potter.test(id)) return null;
    return serialize(await col.doc(id).get());
  }

  async function getOrThrow(id) {
    const potter = await get(id);
    if (!potter) throw ApiError.notFound('Potter not found');
    return potter;
  }

  async function getMany(ids) {
    const unique = [...new Set(ids)].filter((id) => ID_PATTERNS.potter.test(id));
    if (unique.length === 0) return [];
    return (await db.getAll(...unique.map((id) => col.doc(id)))).map(serialize).filter(Boolean);
  }

  /**
   * Registers a potter with the next POT-#### id. The sequence counter, the potter document, the phone
   * reservation (`potter_phones/{phone}`, which makes a duplicate number impossible even under concurrent
   * requests) and the audit entry all commit in ONE transaction: either everything exists or nothing does.
   */
  async function create(input, { createdBy }) {
    const data = parseOrThrow(potterCreateSchema, input);
    const creator = parseOrThrow(docId, createdBy);
    try {
      const id = await db.runTransaction(
        async (tx) => {
          const counter = await counters.peek(tx, COUNTER_NAMES.potter, 1001);
          const phoneRef = phones.doc(data.phone);
          if ((await tx.get(phoneRef)).exists) throw duplicatePhone();

          const potterId = formatPotterId(counter.value);
          counters.commit(tx, counter);
          tx.create(col.doc(potterId), {
            ...data,
            ...searchFields(data),
            status: 'active',
            registrationDate: serverTimestamp(),
            createdBy: creator,
            updatedAt: serverTimestamp(),
          });
          tx.create(phoneRef, { potterId, createdAt: serverTimestamp() });
          auditLogs.write(tx, {
            actor: { type: 'admin', id: creator },
            action: 'potter.create',
            target: { collection: COLLECTIONS.potters, id: potterId },
            after: { status: 'active' },
          });
          return potterId;
        },
        { maxAttempts: COUNTER_TX_ATTEMPTS }, // every registration contends on the one counter document
      );
      return await getOrThrow(id);
    } catch (err) {
      // Firestore code 6 = ALREADY_EXISTS: the counter is behind existing data. Never overwrite a potter.
      if (err?.code === 6) throw ApiError.conflict('Potter ID already exists (sequence counter out of sync)', 'ID_COLLISION');
      throw err;
    }
  }

  /** Edits profile fields. A phone change atomically moves the reservation, and is refused if another potter owns the number. */
  async function update(id, patch, { actor } = {}) {
    const data = parseOrThrow(potterUpdateSchema, patch);
    const by = actor ? parseOrThrow(actorSchema, actor) : null;
    if (!ID_PATTERNS.potter.test(id)) throw ApiError.notFound('Potter not found');

    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.notFound('Potter not found');
      const current = snap.data();

      const phoneChanged = data.phone !== undefined && data.phone !== current.phone;
      if (phoneChanged) {
        const owner = await tx.get(phones.doc(data.phone));
        if (owner.exists && owner.data().potterId !== id) throw duplicatePhone();
      }

      const merged = { ...current, ...data };
      const derived = 'name' in data || 'village' in data ? searchFields(merged) : {};
      tx.update(ref, { ...data, ...derived, updatedAt: serverTimestamp() });
      if (phoneChanged) {
        if (current.phone) tx.delete(phones.doc(current.phone));
        tx.set(phones.doc(data.phone), { potterId: id, createdAt: serverTimestamp() });
      }
      // Field NAMES only: phone numbers and addresses are personal data and never go into the audit log.
      if (by) {
        auditLogs.write(tx, {
          actor: by,
          action: 'potter.update',
          target: { collection: COLLECTIONS.potters, id },
          after: { changed: Object.keys(data) },
        });
      }
    });

    // Public-safe fields are denormalised onto products (see DATABASE_DESIGN §3.3).
    if ('name' in data || 'village' in data || 'district' in data) {
      await products.refreshPotterSnapshot(id);
    }
    return getOrThrow(id);
  }

  /**
   * Activates/deactivates a potter and audits the change atomically. Product visibility follows
   * (approved products are suspended/restored in batches). That second step is idempotent, so if it
   * fails the caller can safely repeat the same call.
   */
  async function setStatus(id, status, actor) {
    const next = parseOrThrow(potterStatusSchema, status);
    const by = parseOrThrow(actorSchema, actor);
    if (!ID_PATTERNS.potter.test(id)) throw ApiError.notFound('Potter not found');

    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.notFound('Potter not found');
      const before = snap.data().status;
      tx.update(ref, { status: next, updatedAt: serverTimestamp() });
      if (before !== next) {
        auditLogs.write(tx, {
          actor: by,
          action: next === 'inactive' ? 'potter.deactivate' : 'potter.activate',
          target: { collection: COLLECTIONS.potters, id },
          before: { status: before },
          after: { status: next },
        });
      }
    });

    if (next === 'inactive') await products.suspendAllForPotter(id);
    else await products.restoreAllForPotter(id);
    return getOrThrow(id);
  }

  /** Paginated listing using only declared query shapes (status, district, status+district, featured). */
  async function list({ status, district, featured, limit, cursor } = {}) {
    const equals = [];
    const filters = {};
    if (status !== undefined) {
      equals.push('status');
      filters.status = parseOrThrow(potterStatusSchema, status);
    }
    if (district !== undefined) {
      equals.push('district');
      filters.district = parseOrThrow(districtSchema, district);
    }
    if (featured !== undefined) {
      if (status === undefined || district !== undefined) {
        throw ApiError.badRequest('The featured filter requires a status filter and cannot be combined with district');
      }
      equals.push('featured');
      filters.featured = featured === true;
    }
    return runShape(db, findShape(COLLECTIONS.potters, { equals }), { filters, limit, cursor });
  }

  /**
   * Search by phone (full or prefix), Potter ID (full or prefix) or name/village words. Firestore has no text search,
   * so name matching combines a lower-case prefix query with an any-word query on `searchTokens`. Results are capped
   * (`truncated: true` tells the caller to refine) and filtered by status/district in memory.
   */
  async function search({ q, status, district, limit = SEARCH_CAP }) {
    const query = q.trim();
    const found = new Map();
    const add = (potter) => potter && found.set(potter.id, potter);
    const digits = query.replace(/[\s()-]/g, '');

    const phone = normalizeBdPhone(query);
    if (phone) {
      const reservation = await phones.doc(phone).get();
      if (reservation.exists) add(await get(reservation.data().potterId));
    } else if (/^\+?\d{3,}$/.test(digits)) {
      const national = digits.replace(/^\+?880/, '0');
      const { docs } = await col.where('phone', '>=', national).where('phone', '<', `${national}\uf8ff`).limit(SEARCH_CAP).get();
      docs.map(serialize).forEach(add);
    } else if (/^pot-?\d*$/i.test(query)) {
      const prefix = `POT-${query.replace(/^pot-?/i, '')}`.toUpperCase();
      const { docs } = await col
        .where(FieldPath.documentId(), '>=', prefix)
        .where(FieldPath.documentId(), '<', `${prefix}\uf8ff`)
        .limit(SEARCH_CAP)
        .get();
      docs.map(serialize).forEach(add);
    } else {
      const lower = query.toLowerCase();
      const allWords = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const words = allWords.filter((w) => w.length >= 2); // shorter words are not indexed as tokens
      const byPrefix = await col.where('nameLower', '>=', lower).where('nameLower', '<', `${lower}\uf8ff`).limit(SEARCH_CAP).get();
      byPrefix.docs.map(serialize).forEach(add);
      if (words.length > 0) {
        const primary = words.reduce((a, b) => (b.length > a.length ? b : a));
        const byWord = await col.where('searchTokens', 'array-contains', primary).limit(SEARCH_CAP * 2).get();
        byWord.docs
          .map(serialize)
          .filter((p) => allWords.every((w) => p.searchTokens.includes(w) || p.nameLower.includes(w)))
          .forEach(add);
      }
    }

    const wantedDistrict = district === undefined ? null : parseOrThrow(districtSchema, district);
    const items = [...found.values()]
      .filter((p) => (status === undefined || p.status === status) && (wantedDistrict === null || p.district === wantedDistrict))
      .sort((a, b) => b.registrationDate.localeCompare(a.registrationDate));
    return { items: items.slice(0, limit), nextCursor: null, truncated: items.length > limit || found.size >= SEARCH_CAP };
  }

  return { get, getOrThrow, getMany, create, update, setStatus, list, search };
}
