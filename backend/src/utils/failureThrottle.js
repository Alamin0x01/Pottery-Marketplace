/**
 * In-memory failure counter used by device authentication. It is consulted ONLY after a credential check has
 * already failed, so a device presenting a valid secret is never blocked by it — important because many cellular
 * devices share one carrier-grade-NAT IP address and a single noisy client must not lock the others out.
 * (State is per process; a shared store is needed if the backend ever runs on several instances.)
 */
export function createFailureThrottle({ limit = 20, windowMs = 10 * 60_000, maxKeys = 10_000, now = Date.now } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  function prune(t) {
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
    // Hard cap so an attacker cannot grow the map without bound.
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value);
  }

  return {
    /** Records a failure and returns `{ blocked, retryAfterSec }` for the failure that was just recorded. */
    fail(key) {
      const t = now();
      if (hits.size >= maxKeys) prune(t);
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return { blocked: entry.count > limit, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
    },
    size: () => hits.size,
  };
}
