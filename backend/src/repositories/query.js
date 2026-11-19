import { ApiError } from '../utils/ApiError.js';
import { serialize } from '../db/timestamps.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const encodeCursor = (id) => Buffer.from(JSON.stringify({ id })).toString('base64url');

export function decodeCursor(cursor) {
  try {
    const { id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)) return id;
  } catch {
    /* fall through */
  }
  throw ApiError.badRequest('Invalid cursor');
}

export function normalizeLimit(limit) {
  const n = limit === undefined ? DEFAULT_LIMIT : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw ApiError.badRequest(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return n;
}

/**
 * Executes a declared query shape (see db/queryShapes.js) with cursor pagination.
 * Returns `{ items, nextCursor }`. Fetches limit+1 documents to know whether another page exists.
 */
export async function runShape(db, shape, { filters = {}, range = null, limit, cursor = null, map = (x) => x } = {}) {
  const pageSize = normalizeLimit(limit);
  let query = db.collection(shape.collection);

  for (const field of shape.equals) {
    if (filters[field] === undefined) throw new Error(`Missing filter "${field}" for ${shape.collection} query`);
    query = query.where(field, '==', filters[field]);
  }
  if (shape.arrayContains) {
    if (filters[shape.arrayContains] === undefined) throw new Error(`Missing filter "${shape.arrayContains}"`);
    query = query.where(shape.arrayContains, 'array-contains', filters[shape.arrayContains]);
  }
  if (range) {
    if (range.field !== shape.orderBy.field) {
      throw ApiError.badRequest(`Range filter on "${range.field}" requires sorting by that field`);
    }
    if (range.min != null) query = query.where(range.field, '>=', range.min);
    if (range.max != null) query = query.where(range.field, '<=', range.max);
  }
  query = query.orderBy(shape.orderBy.field, shape.orderBy.dir);

  if (cursor) {
    const snapshot = await db.collection(shape.collection).doc(decodeCursor(cursor)).get();
    if (!snapshot.exists) throw ApiError.badRequest('Invalid cursor');
    query = query.startAfter(snapshot);
  }

  const { docs } = await query.limit(pageSize + 1).get();
  const page = docs.slice(0, pageSize).map(serialize);
  return {
    items: page.map(map),
    nextCursor: docs.length > pageSize ? encodeCursor(page.at(-1).id) : null,
  };
}
