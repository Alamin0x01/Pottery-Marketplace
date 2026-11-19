import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Container } from '../components/layout/Layout.jsx';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';

function TrackingLink({ order }) {
  const [copied, setCopied] = useState(false);
  const path = `/track/${order.orderId}#${order.trackingToken}`;
  const url = `${window.location.origin}${path}`;
  return (
    <div className="mt-3 rounded-2xl bg-cream px-4 py-3 text-sm">
      <p className="text-clay-soft">Save this link: it is the only way to follow this order without an account.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link to={path} className="font-medium text-terracotta-700 underline">Track order</Link>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name="copy" className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}

export function OrderPlacedPage() {
  const { state } = useLocation();
  if (!state?.orders?.length) return <Navigate to="/" replace />;
  const { orders, signedIn, notPlaced = [] } = state;
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-2xl animate-fade-up">
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Icon name="check" className="h-8 w-8" /></span>
          <h1 className="mt-5 text-4xl text-clay-brown">Order request sent</h1>
          <p className="mt-3 text-clay-soft">Thank you. This is a <strong>request</strong>: the potter has not accepted it yet. They will contact you by phone to agree the final price, and you can follow every step here.</p>
        </div>

        <ul className="mt-8 space-y-4">
          {orders.map((o) => (
            <li key={o.orderId} className="rounded-3xl border border-sand bg-white/80 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl text-clay-brown">{o.productName}</p>
                <p className="text-sm text-clay-soft">Quantity {o.quantity}</p>
              </div>
              <p className="mt-1 font-mono text-sm text-clay-soft">{o.orderId}</p>
              {signedIn ? (
                <Link to={`/account/orders/${o.orderId}`} className="mt-3 inline-block text-sm font-medium text-terracotta-700 underline">View this order</Link>
              ) : (
                <TrackingLink order={o} />
              )}
            </li>
          ))}
        </ul>

        {notPlaced.length > 0 && (
          <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Some items were not ordered and are still in your cart:</p>
            <ul className="mt-1 list-inside list-disc">{notPlaced.map((n) => <li key={n.name}>{n.name}: {n.reason}</li>)}</ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/shop" variant="secondary">Continue shopping</ButtonLink>
          {signedIn ? <ButtonLink to="/account/orders">My orders</ButtonLink> : <ButtonLink to="/register" state={{ from: '/account/orders' }}>Create an account</ButtonLink>}
        </div>
      </div>
    </Container>
  );
}
