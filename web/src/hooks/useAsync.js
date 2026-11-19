import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fn(signal)` on mount and whenever `deps` change; returns `{ data, error, loading, reload }`.
 * Stale responses are ignored and in-flight requests are aborted, so a slow request can never overwrite newer data.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const controllerRef = useRef(null);

  const execute = useCallback(async ({ silent = false } = {}) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const ticket = ++run.current;
    if (!silent) setState((s) => ({ ...s, error: null, loading: true }));
    try {
      const data = await fnRef.current(controller.signal);
      if (ticket === run.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (ticket === run.current && error?.name !== 'CanceledError') setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    execute();
    return () => {
      run.current += 1;
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: execute };
}
