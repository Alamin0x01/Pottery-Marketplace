import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, PageTitle } from '../components/layout/Layout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { EmptyState, ErrorState } from '../components/ui/States.jsx';
import { ProductCard, ProductCardSkeleton, ProductGrid } from '../components/shop/ProductCard.jsx';
import { inputClass } from '../components/ui/Fields.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { storeApi } from '../services/storeApi.js';
import { SORT_OPTIONS } from '../utils/constants.js';

const PAGE_SIZE = 12;

/** Loads pages of products and appends them ("load more"); any change of filters starts again from page 1. */
function useProductFeed(filters) {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ items: [], next: null, loading: true, loadingMore: false, error: null });
  const ticket = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchPage = useCallback(async (cursor) => {
    const mine = ++ticket.current;
    const first = !cursor;
    setState((s) => (first ? { items: [], next: null, loading: true, loadingMore: false, error: null } : { ...s, loadingMore: true, error: null }));
    try {
      const page = await storeApi.products({ ...filtersRef.current, limit: PAGE_SIZE, cursor });
      if (mine !== ticket.current) return;
      setState((s) => ({ items: first ? page.items : [...s.items, ...page.items], next: page.nextCursor, loading: false, loadingMore: false, error: null }));
    } catch (error) {
      if (mine === ticket.current) setState((s) => ({ ...s, loading: false, loadingMore: false, error }));
    }
  }, []);

  useEffect(() => {
    fetchPage(null);
    return () => {
      ticket.current += 1;
    };
  }, [key, fetchPage]);

  return { ...state, loadMore: () => state.next && fetchPage(state.next), retry: () => fetchPage(null) };
}

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const potter = params.get('potter') ?? '';

  const update = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === '' || v == null || (k === 'sort' && v === 'newest')) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Search box: type freely, the URL (and the request) follows after a short pause.
  const [text, setText] = useState(q);
  const committed = useRef(q);
  const debounced = useDebounce(text.trim(), 400);
  useEffect(() => {
    if (debounced !== committed.current) {
      committed.current = debounced;
      update({ q: debounced });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Follow URL changes made elsewhere (back button, "Clear all") without overwriting what is being typed.
  useEffect(() => {
    if (q !== committed.current) {
      committed.current = q;
      setText(q);
    }
  }, [q]);

  const [price, setPrice] = useState({ min: minPrice, max: maxPrice });
  useEffect(() => setPrice({ min: minPrice, max: maxPrice }), [minPrice, maxPrice]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const priceError = price.min !== '' && price.max !== '' && Number(price.min) > Number(price.max) ? 'Minimum is higher than maximum.' : null;

  const filters = useMemo(
    () => ({ q, category, minPrice, maxPrice, sort, potterId: potter }),
    [q, category, minPrice, maxPrice, sort, potter],
  );
  const feed = useProductFeed(filters);
  const categories = useAsync((signal) => storeApi.categories(signal), []);
  const sellerName = potter ? feed.items[0]?.seller.name : null;
  const active = [
    q && { key: 'q', label: `“${q}”` },
    category && { key: 'category', label: category },
    (minPrice || maxPrice) && { key: 'price', label: `৳ ${minPrice || '0'} – ${maxPrice ? `৳ ${maxPrice}` : 'any'}`, clear: { minPrice: '', maxPrice: '' } },
    potter && { key: 'potter', label: sellerName ? `By ${sellerName}` : 'One potter’s pieces', clear: { potter: '' } },
  ].filter(Boolean);

  const applyPrice = (e) => {
    e.preventDefault();
    if (!priceError) update({ minPrice: price.min.replace(/\D/g, ''), maxPrice: price.max.replace(/\D/g, '') });
  };

  const sidebar = (
    <div className="space-y-8">
      <div>
        <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-clay-soft">Category</h2>
        <ul className="mt-3 space-y-1">
          <li>
            <button type="button" onClick={() => update({ category: '' })} aria-pressed={!category} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${!category ? 'bg-terracotta-50 font-medium text-terracotta-700' : 'hover:bg-beige/60'}`}>All pottery</button>
          </li>
          {(categories.data ?? []).map((c) => (
            <li key={c.name}>
              <button type="button" onClick={() => update({ category: c.name })} aria-pressed={category === c.name} disabled={c.count === 0 && category !== c.name} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition disabled:opacity-40 ${category === c.name ? 'bg-terracotta-50 font-medium text-terracotta-700' : 'hover:bg-beige/60'}`}>
                {c.name}<span className="text-xs text-clay-soft">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={applyPrice} noValidate>
        <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-clay-soft">Price (৳)</h2>
        <div className="mt-3 flex items-center gap-2">
          <input aria-label="Minimum price" inputMode="numeric" placeholder="Min" value={price.min} onChange={(e) => setPrice((p) => ({ ...p, min: e.target.value.replace(/\D/g, '') }))} className={inputClass} />
          <span className="text-clay-soft">–</span>
          <input aria-label="Maximum price" inputMode="numeric" placeholder="Max" value={price.max} onChange={(e) => setPrice((p) => ({ ...p, max: e.target.value.replace(/\D/g, '') }))} className={inputClass} />
        </div>
        {priceError && <p role="alert" className="mt-1 text-xs text-red-700">{priceError}</p>}
        <Button type="submit" variant="secondary" size="sm" className="mt-3" disabled={Boolean(priceError)}>Apply price</Button>
      </form>
    </div>
  );

  return (
    <Container>
      <PageTitle title="The pottery shop" subtitle="Handmade pieces from village potters across Bangladesh. Orders are requests: the potter calls you to agree the price." />

      <div className="flex flex-wrap items-center gap-3 border-y border-sand/70 py-4">
        <div className="relative min-w-56 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-clay-soft" />
          <input type="search" aria-label="Search pottery" placeholder="Search vases, pots, planters…" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} className={`${inputClass} !rounded-full !pl-10`} />
        </div>
        <label className="flex items-center gap-2 text-sm text-clay-soft">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select aria-label="Sort products" value={sort} onChange={(e) => update({ sort: e.target.value })} className={`${inputClass} !w-auto !rounded-full`}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}><Icon name="filter" className="h-4 w-4" /> Filters</Button>
      </div>

      <div className="grid gap-10 py-8 lg:grid-cols-[15rem_1fr]">
        <aside aria-label="Filters" className={`${filtersOpen ? 'block animate-fade-in' : 'hidden'} lg:block`}>{sidebar}</aside>

        <section aria-live="polite" aria-busy={feed.loading}>
          {active.length > 0 && (
            <ul className="mb-6 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {active.map((f) => (
                <li key={f.key}>
                  <button type="button" onClick={() => update(f.clear ?? { [f.key]: '' })} className="inline-flex items-center gap-1.5 rounded-full bg-terracotta-50 px-3 py-1 text-sm text-terracotta-700 transition hover:bg-terracotta-100">
                    {f.label}<Icon name="close" className="h-3.5 w-3.5" /><span className="sr-only">Remove filter</span>
                  </button>
                </li>
              ))}
              <li><button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm text-clay-soft underline hover:text-clay-brown">Clear all</button></li>
            </ul>
          )}

          {feed.error && feed.items.length === 0 ? (
            <ErrorState error={feed.error} onRetry={feed.retry} />
          ) : feed.loading ? (
            <ProductGrid>{Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
          ) : feed.items.length === 0 ? (
            <EmptyState
              icon="search"
              title={active.length > 0 ? 'No pottery matches these filters' : 'No pottery is listed yet'}
              description={active.length > 0 ? 'Try a different search, widen the price range or clear the filters.' : 'New pieces appear here as soon as they are approved. Please check back soon.'}
              action={active.length > 0 && <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>Clear all filters</Button>}
            />
          ) : (
            <>
              <p className="mb-5 text-sm text-clay-soft">Showing {feed.items.length} {feed.items.length === 1 ? 'piece' : 'pieces'}{feed.next ? ' so far' : ''}</p>
              <ProductGrid>{feed.items.map((p, i) => <ProductCard key={p.id} product={p} index={i % PAGE_SIZE} />)}</ProductGrid>
              {feed.error && <p role="alert" className="mt-6 text-center text-sm text-red-700">Could not load more: {feed.error.message}</p>}
              {feed.next && (
                <div className="mt-12 flex justify-center">
                  <Button variant="secondary" size="lg" onClick={feed.loadMore} loading={feed.loadingMore}>Load more pieces</Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Container>
  );
}
