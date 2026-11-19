import { SHAPES, indexFieldsFor } from './queryShapes.js';
import { COLLECTIONS as C } from './collections.js';

const asc = (fieldPath) => ({ fieldPath, order: 'ASCENDING' });
const desc = (fieldPath) => ({ fieldPath, order: 'DESCENDING' });

// Indexes for queries that arrive in later phases (documented in docs/DATABASE_DESIGN.md).
const RESERVED = [
  { collection: C.devices, fields: [asc('status'), asc('lastSeen')] }, // offline lists (Phase 4)
  { collection: C.orders, fields: [asc('buyerPhone'), asc('productId'), desc('createdAt')] }, // duplicate-order guard (Phase 7)
  { collection: C.products, fields: [asc('aiStatus'), asc('aiNextAttemptAt')] }, // AI worker claim (Phase 6)
  { collection: C.products, fields: [asc('aiStatus'), asc('aiLeaseUntil')] }, // AI worker lease recovery (Phase 6)
  { collection: C.notifications, fields: [asc('deviceId'), asc('status'), asc('createdAt')] }, // device poll (Phase 9)
  { collection: C.notifications, fields: [asc('status'), asc('createdAt')] }, // escalation sweep (Phase 9)
  { collection: C.auditLogs, fields: [asc('action'), desc('timestamp')] }, // audit viewer (Phase 10)
  { collection: C.auditLogs, fields: [asc('target.collection'), asc('target.id'), desc('timestamp')] },
  { collection: C.auditLogs, fields: [asc('actor.id'), desc('timestamp')] },
];

const key = (i) => `${i.collectionGroup}|${i.fields.map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(',')}`;

/** Builds the content of firestore.indexes.json from the query shapes plus the reserved list. */
export function buildIndexes() {
  const all = [
    ...SHAPES.map((s) => ({ collection: s.collection, fields: indexFieldsFor(s) })).filter((i) => i.fields),
    ...RESERVED,
  ].map((i) => ({ collectionGroup: i.collection, queryScope: 'COLLECTION', fields: i.fields }));

  const unique = new Map(all.map((i) => [key(i), i]));
  const indexes = [...unique.values()].sort((a, b) => key(a).localeCompare(key(b)));
  return { indexes, fieldOverrides: [] };
}
