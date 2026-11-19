import { ApiError } from '../utils/ApiError.js';
import { COLLECTIONS as C } from './collections.js';

/**
 * Every list query the repositories can run is declared here as a "shape".
 * The Firestore composite indexes are *derived* from these shapes (see indexes.js), so a query
 * can never exist without its index, and `firestore.indexes.json` is generated, not hand-edited.
 *
 *  equals        equality filters (all required, in index order)
 *  arrayContains optional array-contains field (also required when set)
 *  orderBy       the single ordering field (a range filter, if any, must use this same field)
 *  sort          name used to pick between shapes with the same filters
 */
const shape = (collection, equals, field, dir, { arrayContains = null, sort = 'default' } = {}) =>
  Object.freeze({ collection, equals, arrayContains, orderBy: Object.freeze({ field, dir }), sort });

export const SHAPES = Object.freeze([
  shape(C.potters, [], 'registrationDate', 'desc'),
  shape(C.potters, ['status'], 'registrationDate', 'desc'),
  shape(C.potters, ['status', 'featured'], 'registrationDate', 'desc'),
  shape(C.potters, ['district'], 'registrationDate', 'desc'),
  shape(C.potters, ['status', 'district'], 'registrationDate', 'desc'),

  shape(C.devices, [], 'registeredAt', 'desc'),
  shape(C.devices, ['status'], 'registeredAt', 'desc'),
  // Connectivity listings: ordered by last contact. Offline = oldest first (never-seen sort first in Firestore),
  // online = newest first with a lastSeen >= threshold range.
  shape(C.devices, ['status'], 'lastSeen', 'asc', { sort: 'seen_asc' }),
  shape(C.devices, ['status'], 'lastSeen', 'desc', { sort: 'seen_desc' }),

  shape(C.deviceEvents, ['deviceId'], 'at', 'desc'),

  shape(C.products, [], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['status'], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['status', 'category'], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['status', 'potterId'], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['status', 'featured'], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['potterId'], 'createdAt', 'desc', { sort: 'newest' }),
  shape(C.products, ['status'], 'createdAt', 'desc', { sort: 'newest', arrayContains: 'searchTokens' }),
  shape(C.products, ['status'], 'price', 'asc', { sort: 'price_asc' }),
  shape(C.products, ['status'], 'price', 'desc', { sort: 'price_desc' }),
  shape(C.products, ['status', 'category'], 'price', 'asc', { sort: 'price_asc' }),
  shape(C.products, ['status', 'category'], 'price', 'desc', { sort: 'price_desc' }),

  shape(C.orders, [], 'createdAt', 'desc'),
  shape(C.orders, ['potterId'], 'createdAt', 'desc'),
  shape(C.orders, ['potterId', 'status'], 'createdAt', 'desc'),
  shape(C.orders, ['status'], 'createdAt', 'desc'),
  shape(C.orders, ['customerId'], 'createdAt', 'desc'),
  shape(C.orders, ['needsAdminAttention'], 'createdAt', 'desc'),

  shape(C.orderHistory, ['orderId'], 'timestamp', 'asc'),

  shape(C.auditLogs, [], 'timestamp', 'desc'),
  shape(C.auditLogs, ['target.collection', 'target.id'], 'timestamp', 'desc'),
  shape(C.admins, [], 'createdAt', 'desc'),
]);

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Finds the declared shape for a filter combination or throws 400 (never builds an un-indexed query). */
export function findShape(collection, { equals = [], arrayContains = null, sort = 'default' } = {}) {
  const found = SHAPES.find(
    (s) => s.collection === collection && s.sort === sort && s.arrayContains === arrayContains && sameSet(s.equals, equals),
  );
  if (!found) {
    throw ApiError.badRequest('Unsupported filter/sort combination', [
      { path: collection, message: `filters=[${equals.join(',')}] arrayContains=${arrayContains ?? '-'} sort=${sort}` },
    ]);
  }
  return found;
}

/** Composite index fields a shape needs, or null when Firestore's automatic single-field index suffices. */
export function indexFieldsFor(s) {
  const fields = [
    ...s.equals.map((fieldPath) => ({ fieldPath, order: 'ASCENDING' })),
    ...(s.arrayContains ? [{ fieldPath: s.arrayContains, arrayConfig: 'CONTAINS' }] : []),
    { fieldPath: s.orderBy.field, order: s.orderBy.dir === 'desc' ? 'DESCENDING' : 'ASCENDING' },
  ];
  return fields.length >= 2 ? fields : null;
}
