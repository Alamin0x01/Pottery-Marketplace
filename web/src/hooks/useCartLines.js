import { useMemo } from 'react';
import { useAsync } from './useAsync.js';
import { storeApi } from '../services/storeApi.js';
import { lineState, subtotal } from '../lib/cart.js';

/**
 * Joins the cart (IDs and quantities) with fresh product data from the backend. Prices and availability always come
 * from the server, so a stale cart can never show an old price or let someone order more than is in stock.
 * Each line: `{ item, product, status: ok|reduced|soldout|gone, effectiveQuantity }`.
 */
export function useCartLines(items) {
  const ids = items.map((i) => i.productId);
  const key = ids.join(',');
  const { data, error, loading, reload } = useAsync(
    async (signal) => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await storeApi.product(id, signal)];
          } catch (err) {
            if (err.status === 404 || err.status === 400) return [id, null]; // no longer for sale
            throw err;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    [key],
  );

  const lines = useMemo(
    () => (data ? items.map((item) => ({ item, product: data[item.productId] ?? null, ...lineState(item, data[item.productId] ?? null) })) : []),
    [data, items],
  );
  return { lines, total: subtotal(lines), loading: loading && !data, error: error && !data ? error : null, reload };
}
