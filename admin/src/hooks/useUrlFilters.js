import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters that live in the URL (`?status=offline&q=DEV-0`), so a refresh, the back button and links such as the
 * dashboard's "Offline devices" card all land on the same filtered list. Empty values are removed from the URL.
 */
export function useUrlFilters(keys) {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? '']));
  const setFilter = useCallback(
    (key, value) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, setFilter];
}
