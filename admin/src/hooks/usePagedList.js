import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cursor pagination for the backend's `{ items, nextCursor }` lists.
 * `fetchPage({ ...filters, cursor }, signal)` loads one page. Changing `filters` (compared by value) goes back to
 * page 1. The cursors of the pages already visited are kept, so "Previous" never needs a request the server
 * cannot answer, and stale responses are discarded.
 */
export function usePagedList(fetchPage, filters) {
  const key = JSON.stringify(filters);
  // Cursors belong to one filter set; a different key means "start again from page 1" without an extra render pass.
  const [visited, setVisited] = useState({ key, cursors: [null] });
  const cursors = visited.key === key ? visited.cursors : [null];
  const current = cursors[cursors.length - 1];

  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = useCallback(async (cursor, { silent = false } = {}) => {
    const ticket = ++run.current;
    if (!silent) setState((s) => ({ ...s, error: null, loading: true }));
    try {
      const data = await fetchRef.current({ ...filtersRef.current, cursor: cursor ?? undefined });
      if (ticket === run.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (ticket === run.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    load(current);
    return () => {
      run.current += 1; // discard the response of a superseded request
    };
  }, [load, current, key]);

  return {
    ...state,
    page: cursors.length,
    hasPrev: cursors.length > 1,
    hasNext: Boolean(state.data?.nextCursor),
    next: () => state.data?.nextCursor && setVisited({ key, cursors: [...cursors, state.data.nextCursor] }),
    prev: () => cursors.length > 1 && setVisited({ key, cursors: cursors.slice(0, -1) }),
    reload: (opts) => load(current, opts),
  };
}
