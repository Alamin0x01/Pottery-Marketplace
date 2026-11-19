import { Link } from 'react-router-dom';
import { OrderStatusBadge } from '../ui/Badge.jsx';
import { Icon } from '../ui/Icon.jsx';
import { ProductImage } from '../shop/ProductImage.jsx';
import { ORDER_STATUS_META, ORDER_STEPS } from '../../utils/constants.js';
import { formatBdt, formatDate, formatDateTime, formatPhone } from '../../utils/format.js';

/** Horizontal (wrapping) progress through the normal order path. Cancelled orders show a notice instead. */
export function OrderProgress({ status }) {
  if (status === 'cancelled') {
    return <p role="status" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{ORDER_STATUS_META.cancelled.text}</p>;
  }
  const current = ORDER_STATUS_META[status]?.step ?? 0;
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" aria-label="Order progress">
      {ORDER_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} aria-current={active ? 'step' : undefined} className="flex items-center gap-2 text-xs sm:flex-col sm:items-start sm:gap-1.5">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ring-1 ring-inset transition ${done ? 'bg-terracotta-600 text-white ring-terracotta-600' : active ? 'bg-terracotta-50 text-terracotta-700 ring-terracotta-500' : 'bg-white text-clay-soft ring-sand'}`}>
              {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
            </span>
            <span className={active ? 'font-semibold text-clay-brown' : done ? 'text-clay-brown' : 'text-clay-soft'}>{ORDER_STATUS_META[s].label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Customer-facing order details. `order` is the customer-safe view from the API. */
export function OrderView({ order }) {
  const meta = ORDER_STATUS_META[order.status];
  const unit = order.negotiatedPrice ?? order.listedPrice;
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sand bg-white/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-clay-soft">Order</p>
            <p className="font-mono text-lg text-clay-brown">{order.id}</p>
            <p className="text-sm text-clay-soft">Placed {formatDateTime(order.createdAt)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        {meta && <p className="mt-4 text-sm text-clay-brown">{meta.text}</p>}
        <div className="mt-6"><OrderProgress status={order.status} /></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-sand bg-white/70 p-6">
          <h2 className="text-xl text-clay-brown">Item</h2>
          <div className="mt-4 flex gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-beige"><ProductImage src={order.productImageUrl} alt={order.productName} /></div>
            <div className="min-w-0">
              <Link to={`/shop/${order.productId}`} className="font-display text-lg text-clay-brown hover:text-terracotta-700">{order.productName}</Link>
              <p className="text-sm text-clay-soft">Quantity: {order.quantity}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-2 border-t border-sand pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-clay-soft">Listed price (each)</dt><dd>{formatBdt(order.listedPrice)}</dd></div>
            <div className="flex justify-between"><dt className="text-clay-soft">Negotiated price (each)</dt><dd>{order.negotiatedPrice != null ? <strong className="text-terracotta-700">{formatBdt(order.negotiatedPrice)}</strong> : <span className="text-clay-soft">Not agreed yet</span>}</dd></div>
            <div className="flex justify-between border-t border-sand pt-2 text-base"><dt className="font-medium">{order.negotiatedPrice != null ? 'Total' : 'Total at listed price'}</dt><dd className="font-semibold text-terracotta-700">{formatBdt(unit * order.quantity)}</dd></div>
          </dl>
        </section>

        <section className="rounded-3xl border border-sand bg-white/70 p-6">
          <h2 className="text-xl text-clay-brown">Delivery</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-clay-soft">Name</dt><dd className="font-medium">{order.delivery.name}</dd></div>
            <div><dt className="text-clay-soft">Phone</dt><dd className="font-medium">{formatPhone(order.delivery.phone)}</dd></div>
            <div><dt className="text-clay-soft">Address</dt><dd className="font-medium">{order.delivery.address}{order.delivery.district && `, ${order.delivery.district}`}</dd></div>
            {order.courierName && <div><dt className="text-clay-soft">Courier</dt><dd className="font-medium">{order.courierName}</dd></div>}
            {order.trackingNumber && <div><dt className="text-clay-soft">Tracking number</dt><dd className="font-mono font-medium">{order.trackingNumber}</dd></div>}
          </dl>
        </section>
      </div>

      {order.timeline?.length > 0 && (
        <section className="rounded-3xl border border-sand bg-white/70 p-6">
          <h2 className="text-xl text-clay-brown">History</h2>
          <ol className="mt-4 space-y-3 border-l-2 border-sand pl-5">
            {[...order.timeline].reverse().map((t, i) => (
              <li key={`${t.status}-${t.timestamp}-${i}`} className="relative text-sm">
                <span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full bg-terracotta-500 ring-4 ring-cream" aria-hidden="true" />
                <p className="font-medium text-clay-brown">{ORDER_STATUS_META[t.status]?.label ?? t.status}</p>
                <p className="text-xs text-clay-soft">{formatDateTime(t.timestamp)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="text-xs text-clay-soft">Last updated {formatDate(order.updatedAt)}. The potter agrees the final price with you by phone; nothing is charged online.</p>
    </div>
  );
}
