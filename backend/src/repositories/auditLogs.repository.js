import { COLLECTIONS } from '../db/collections.js';
import { serverTimestamp } from '../db/timestamps.js';
import { auditEntrySchema } from '../db/schemas/system.js';
import { parseOrThrow } from '../utils/validate.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';

/** Append-only audit trail. Entries are validated and may never contain secret-like keys. */
export function createAuditLogsRepository(db) {
  const col = db.collection(COLLECTIONS.auditLogs);
  const build = (entry) => ({ ...parseOrThrow(auditEntrySchema, entry), timestamp: serverTimestamp() });

  return {
    /** Adds the entry to a running transaction so it commits atomically with the change it describes. */
    write(tx, entry) {
      tx.create(col.doc(), build(entry));
    },
    async append(entry) {
      const ref = col.doc();
      await ref.create(build(entry));
      return ref.id;
    },
    /** Newest first. */
    listRecent({ limit, cursor } = {}) {
      return runShape(db, findShape(COLLECTIONS.auditLogs, { equals: [] }), { limit, cursor });
    },
    /** Newest-first administrative history of one document (e.g. all changes made to a device). */
    listForTarget(collection, id, { limit, cursor } = {}) {
      return runShape(db, findShape(COLLECTIONS.auditLogs, { equals: ['target.collection', 'target.id'] }), {
        filters: { 'target.collection': collection, 'target.id': id },
        limit,
        cursor,
      });
    },
  };
}
