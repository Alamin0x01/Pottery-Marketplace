import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { ProductThumb } from '../../components/ui/ProductThumb.jsx';
import { ORDER_STATUS_META, PRODUCT_STATUS_META } from '../../utils/constants.js';
import { formatBdt, formatRelative } from '../../utils/format.js';

const SeeAll = ({ to }) => <Link to={to} className="text-xs font-medium text-terracotta-600 hover:text-terracotta-700">View all</Link>;

function TableSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
    </div>
  );
}

export function RecentOrders({ state }) {
  const { data, error, loading, reload } = state;
  const columns = [
    { key: 'id', header: 'Order', render: (o) => <span className="font-mono text-xs text-charcoal">{o.id}</span> },
    {
      key: 'product',
      header: 'Product',
      render: (o) => (
        <span className="flex items-center gap-1.5">
          {o.needsAdminAttention && <span title={`Needs follow-up: ${o.attentionReason}`} className="text-amber-600"><Icon name="alert" className="h-4 w-4" /></span>}
          <span className="max-w-44 truncate">{o.productName ?? '—'}</span>
        </span>
      ),
    },
    { key: 'buyer', header: 'Buyer', hideBelow: 'md', render: (o) => o.buyerName },
    { key: 'qty', header: 'Qty', hideBelow: 'sm', className: 'text-right', render: (o) => o.quantity },
    { key: 'total', header: 'Total', hideBelow: 'sm', className: 'text-right', render: (o) => formatBdt((o.negotiatedPrice ?? o.listedPrice) * o.quantity) },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge value={o.status} meta={ORDER_STATUS_META} /> },
    { key: 'placed', header: 'Placed', hideBelow: 'lg', render: (o) => <span className="text-charcoal-soft">{formatRelative(o.createdAt)}</span> },
  ];
  return (
    <Card title="Recent orders" subtitle="Latest order requests" action={<SeeAll to="/orders" />} className="lg:col-span-2">
      {loading && !data ? <TableSkeleton /> : error && !data ? <ErrorState error={error} onRetry={reload} compact /> : data.items.length === 0 ? (
        <EmptyState icon="orders" title="No orders yet" description="Orders appear here as soon as customers place requests." />
      ) : (
        <DataTable columns={columns} rows={data.items} caption="Recent orders" />
      )}
    </Card>
  );
}

export function RecentProducts({ state }) {
  const { data, error, loading, reload } = state;
  return (
    <Card title="Recent products" subtitle="Newest listings, including drafts" action={<SeeAll to="/products" />}>
      {loading && !data ? <TableSkeleton /> : error && !data ? <ErrorState error={error} onRetry={reload} compact /> : data.items.length === 0 ? (
        <EmptyState icon="products" title="No products yet" description="Photos taken on potter devices appear here as drafts." />
      ) : (
        <ul className="divide-y divide-line">
          {data.items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <ProductThumb product={p} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal">{p.name ?? 'Untitled draft'}</p>
                  <p className="truncate text-xs text-charcoal-soft">
                    {p.potterName} · {p.price ? formatBdt(p.price) : 'No price yet'} · {formatRelative(p.createdAt)}
                  </p>
                </div>
              </div>
              <StatusBadge value={p.status} meta={PRODUCT_STATUS_META} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
