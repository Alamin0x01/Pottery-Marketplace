import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { OrderStatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, PageSpinner, Skeleton } from '../../components/ui/States.jsx';
import { OrderView } from '../../components/shop/OrderView.jsx';
import { ProductImage } from '../../components/shop/ProductImage.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { storeApi } from '../../services/storeApi.js';
import { formatBdt, formatDate } from '../../utils/format.js';

const PAGE = 10;

export function OrdersPage() {
  const [state, setState] = useState({ items: [], next: null, loading: true, loadingMore: false, error: null });
  const ticket = useRef(0);

  const load = useCallback(async (cursor) => {
    const mine = ++ticket.current;
    setState((s) => (cursor ? { ...s, loadingMore: true, error: null } : { items: [], next: null, loading: true, loadingMore: false, error: null }));
    try {
      const page = await storeApi.myOrders({ limit: PAGE, cursor });
      if (mine === ticket.current) setState((s) => ({ items: cursor ? [...s.items, ...page.items] : page.items, next: page.nextCursor, loading: false, loadingMore: false, error: null }));
    } catch (error) {
      if (mine === ticket.current) setState((s) => ({ ...s, loading: false, loadingMore: false, error }));
    }
  }, []);
  useEffect(() => {
    load(null);
    return () => {
      ticket.current += 1;
    };
  }, [load]);

  if (state.loading) return <div className="space-y-4" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>;
  if (state.error && state.items.length === 0) return <ErrorState error={state.error} onRetry={() => load(null)} />;
  if (state.items.length === 0) {
    return <EmptyState icon="box" title="No orders yet" description="When you send an order request it appears here, and you can follow it from the potter to your door." action={<ButtonLink to="/shop">Browse the shop</ButtonLink>} />;
  }
  return (
    <div>
      <ul className="space-y-4">
        {state.items.map((o) => (
          <li key={o.id}>
            <Link to={`/account/orders/${o.id}`} className="group flex gap-4 rounded-3xl border border-sand bg-white/70 p-4 transition hover:border-terracotta-200 hover:shadow-md sm:p-5">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-beige sm:h-24 sm:w-24"><ProductImage src={o.productImageUrl} alt="" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="truncate font-display text-lg text-clay-brown group-hover:text-terracotta-700">{o.productName}</p>
                  <OrderStatusBadge status={o.status} />
                </div>
                <p className="mt-0.5 font-mono text-xs text-clay-soft">{o.id}</p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-clay-soft">Qty {o.quantity} · {formatDate(o.createdAt)}</span>
                  <span>
                    {o.negotiatedPrice != null ? <><span className="mr-2 text-xs text-clay-soft line-through">{formatBdt(o.listedPrice)}</span><strong className="text-terracotta-700">{formatBdt(o.negotiatedPrice)}</strong></> : <span className="font-semibold text-terracotta-700">{formatBdt(o.listedPrice)}</span>}
                    <span className="text-xs text-clay-soft"> each</span>
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {state.error && <p role="alert" className="mt-4 text-center text-sm text-red-700">Could not load more: {state.error.message}</p>}
      {state.next && <div className="mt-8 flex justify-center"><Button variant="secondary" onClick={() => load(state.next)} loading={state.loadingMore}>Load older orders</Button></div>}
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, error, loading, reload } = useAsync((signal) => storeApi.order(id, undefined, signal), [id]);
  if (loading && !order) return <PageSpinner label="Loading your order…" />;
  if (error && !order) {
    return error.status === 404 || error.status === 400 ? (
      <EmptyState icon="search" title="Order not found" description="This order does not exist or does not belong to your account." action={<ButtonLink to="/account/orders">Back to my orders</ButtonLink>} />
    ) : (
      <ErrorState error={error} onRetry={reload} />
    );
  }
  return (
    <div>
      <Link to="/account/orders" className="mb-5 inline-block text-sm text-clay-soft hover:text-terracotta-700">← All orders</Link>
      <OrderView order={order} />
    </div>
  );
}
