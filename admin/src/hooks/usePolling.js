import { useEffect, useRef } from 'react';

/** Calls `callback` every `ms` while the browser tab is visible (and once when it becomes visible again). */
export function usePolling(callback, ms) {
  const latest = useRef(callback);
  latest.current = callback; // callers may pass a new function every render without restarting the timer
  useEffect(() => {
    let timer;
    const run = () => latest.current();
    const start = () => {
      stop();
      timer = setInterval(run, ms);
    };
    const stop = () => clearInterval(timer);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
        start();
      } else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms]);
}
