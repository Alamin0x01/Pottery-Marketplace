import { COLLECTIONS } from '../db/collections.js';
import { serverTimestamp } from '../db/timestamps.js';

// Transactions that take a number from a counter all contend on one document, so they get a larger retry budget.
export const COUNTER_TX_ATTEMPTS = 25;

/**
 * Transactional sequence counters (POT-####, DEV-###).
 * A transaction must perform all reads before any write, so the increment is split in two:
 * `peek` (read) before other reads/writes, `commit` (write) afterwards. The counter stores the
 * last issued number.
 */
export function createCountersRepository(db) {
  const col = db.collection(COLLECTIONS.counters);
  return {
    async peek(tx, name, start) {
      const ref = col.doc(name);
      const snap = await tx.get(ref);
      return { ref, value: snap.exists ? snap.data().value + 1 : start };
    },
    commit(tx, { ref, value }) {
      tx.set(ref, { value, updatedAt: serverTimestamp() });
    },
  };
}
