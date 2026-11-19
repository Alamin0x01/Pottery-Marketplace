import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/ui/Icon.jsx';
import { Spinner } from '../components/ui/States.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { useDismiss } from '../components/ui/Popover.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { adminApi } from '../services/adminApi.js';
import { STATUS_META } from '../utils/constants.js';

const TYPE_LABEL = { potter: 'Potter', device: 'Device', order: 'Order' };

/**
 * Global lookup by exact ID (POT-1001, DEV-001, ORD-…). It queries the backend, so every result is a real record.
 * Free-text search across names lives on the Potters and Devices list pages (Phase 4).
 */
export function SearchBox() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, results: [], hint: null, error: null });
  const wrapper = useRef(null);
  const debounced = useDebounce(query.trim(), 300);
  useDismiss(wrapper, open, () => setOpen(false));

  useEffect(() => {
    if (!debounced) {
      setState({ loading: false, results: [], hint: null, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    adminApi
      .search(debounced, controller.signal)
      .then((r) => setState({ loading: false, results: r.results, hint: r.hint, error: null }))
      .catch((error) => {
        if (error?.name !== 'CanceledError') setState({ loading: false, results: [], hint: null, error });
      });
    return () => controller.abort();
  }, [debounced]);

  const go = (result) => {
    setOpen(false);
    setQuery('');
    navigate(result.path);
  };

  return (
    <div className="relative w-full max-w-md" ref={wrapper}>
      <label htmlFor="global-search" className="sr-only">Search by Potter, Device or Order ID</label>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        id="global-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && state.results[0] && go(state.results[0])}
        placeholder="Find POT-1001, DEV-001, ORD-…"
        autoComplete="off"
        className="w-full rounded-lg border border-line bg-stone-50/70 py-2 pl-9 pr-3 text-sm text-charcoal placeholder:text-stone-400 focus:border-terracotta-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
      />
      {open && debounced && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-lg" role="listbox" aria-label="Search results">
          {state.loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-charcoal-soft"><Spinner className="h-4 w-4" /> Searching…</div>
          )}
          {!state.loading && state.error && <p className="px-4 py-3 text-sm text-red-700">{state.error.message}</p>}
          {!state.loading && !state.error && state.results.length === 0 && (
            <p className="px-4 py-3 text-sm text-charcoal-soft">{state.hint ?? 'No results.'}</p>
          )}
          {!state.loading &&
            state.results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                role="option"
                onClick={() => go(r)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 focus:bg-stone-50 focus:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-charcoal">{r.title}</span>
                  <span className="block truncate text-xs text-charcoal-soft">{TYPE_LABEL[r.type]} · {r.id} · {r.subtitle}</span>
                </span>
                <StatusBadge value={r.status} meta={STATUS_META[r.type]} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
