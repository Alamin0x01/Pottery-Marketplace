import { useEffect, useState } from 'react';

/**
 * Can the browser reach `url`? Any HTTP response (even 404) counts as reachable; only a refused/failed
 * connection is "unreachable". Used for the local Firebase emulator, which answers CORS requests.
 * Re-checks every `intervalMs` until reachable, so a warning disappears by itself once the service is started.
 */
export async function isReachable(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** `null` while checking, then true/false. Disabled (returns true) when `url` is falsy. */
export function useReachable(url, intervalMs = 3000) {
  const [reachable, setReachable] = useState(url ? null : true);
  useEffect(() => {
    if (!url) return undefined;
    let stopped = false;
    let timer;
    const check = async () => {
      const ok = await isReachable(url);
      if (stopped) return;
      setReachable(ok);
      timer = setTimeout(check, ok ? 15_000 : intervalMs);
    };
    check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url, intervalMs]);
  return reachable;
}
