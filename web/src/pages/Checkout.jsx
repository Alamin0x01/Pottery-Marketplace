import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Container, PageTitle } from '../components/layout/Layout.jsx';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { QuantityStepper } from '../components/ui/QuantityStepper.jsx';
import { SelectField, TextField } from '../components/ui/Fields.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { ProductImage } from '../components/shop/ProductImage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCartLines } from '../hooks/useCartLines.js';
import { useAsync } from '../hooks/useAsync.js';
import { idempotencyKeyFor } from '../lib/cart.js';
import { storeApi } from '../services/storeApi.js';
import { fieldErrorsFromApi, validateDelivery } from '../utils/validation.js';
import { formatBdt } from '../utils/format.js';

const CHECKOUT_KEY = 'mati.checkout.v1';

/** One id per checkout attempt, kept in this tab: retrying the same attempt reuses the same idempotency keys. */
function checkoutId() {
  try {
    let id = sessionStorage.getItem(CHECKOUT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(CHECKOUT_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
const forgetCheckout = () => {
  try {
    sessionStorage.removeItem(CHECKOUT_KEY);
  } catch {
    /* ignore */
  }
};

// Field names the API uses -> field names of this form
const API_FIELD = { buyerName: 'name', buyerPhone: 'phone', deliveryAddress: 'address', deliveryDistrict: 'district' };

function friendlyOrderError(err) {
  switch (err.code) {
    case 'DUPLICATE_ORDER':
      return 'You already sent an order request for this piece a moment ago. Check "My orders" before trying again.';
    case 'INSUFFICIENT_STOCK':
      return err.message;
    case 'RATE_LIMITED':
      return 'Too many order attempts. Please wait a few minutes and try again.';
    case 'PROFILE_REQUIRED':
      return 'Please complete your profile before ordering.';
    default:
      if (err.status === 404) return 'This piece is no longer available.';
      if (err.status === 409) return err.message;
      return err.message || 'The order could not be placed.';
  }
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useCart();
  const auth = useAuth();
  const { lines, total, loading, error, reload } = useCartLines(cart.items);
  const districts = useAsync((signal) => storeApi.districts(signal), []);

  const [form, setForm] = useState({ name: '', phone: '', address: '', district: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [failures, setFailures] = useState({});
  const [busy, setBusy] = useState(false);
  const [addressId, setAddressId] = useState('');
  const submitting = useRef(false);
  const prefilled = useRef(false);

  const profile = auth.profile;
  const signedIn = auth.status === 'signed-in';
  const needsProfile = signedIn && auth.profileState === 'ready' && !profile;

  // Pre-fill once from the profile and the default saved address (never overwrites what the user typed).
  useEffect(() => {
    if (prefilled.current || !profile) return;
    prefilled.current = true;
    const preferred = profile.addresses?.find((a) => a.isDefault) ?? null;
    setAddressId(preferred?.id ?? '');
    setForm((f) => ({
      name: f.name || preferred?.recipientName || profile.name,
      phone: f.phone || preferred?.phone || profile.phone,
      address: f.address || preferred?.line || '',
      district: f.district || preferred?.district || '',
    }));
  }, [profile]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const useSaved = (id) => {
    setAddressId(id);
    const a = profile?.addresses?.find((x) => x.id === id);
    if (a) setForm({ name: a.recipientName, phone: a.phone, address: a.line, district: a.district });
  };

  const orderable = lines.filter((l) => l.effectiveQuantity > 0 && l.status === 'ok');
  const reduced = lines.filter((l) => l.status === 'reduced');
  const excluded = lines.filter((l) => l.status === 'gone' || l.status === 'soldout');

  if (cart.items.length === 0 && !busy) {
    return (
      <Container className="py-16">
        <EmptyState icon="bag" title="Your cart is empty" description="Add a piece to your cart before checking out." action={<ButtonLink to="/shop">Browse the shop</ButtonLink>} />
      </Container>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting.current) return; // a double click can never send two orders
    const found = validateDelivery(form, districts.data ?? []);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    if (orderable.length === 0) return;

    submitting.current = true;
    setBusy(true);
    const attempt = checkoutId();
    const placed = [];
    const failed = {};
    for (const line of orderable) {
      try {
        const res = await storeApi.placeOrder(
          {
            productId: line.product.id,
            quantity: line.effectiveQuantity,
            buyerName: form.name.trim(),
            buyerPhone: form.phone.trim(),
            deliveryAddress: form.address.trim(),
            deliveryDistrict: form.district,
          },
          idempotencyKeyFor(attempt, line.product.id),
        );
        placed.push({ orderId: res.orderId, trackingToken: res.trackingToken, productId: line.product.id, productName: line.product.name, quantity: line.effectiveQuantity });
      } catch (err) {
        failed[line.product.id] = friendlyOrderError(err);
        if (err.status === 400) {
          const fromApi = {};
          for (const [path, message] of Object.entries(fieldErrorsFromApi(err))) if (API_FIELD[path]) fromApi[API_FIELD[path]] = message;
          setErrors(fromApi);
          setFormError(Object.keys(fromApi).length > 0 ? 'Please fix the highlighted fields.' : err.message);
          break; // the same details would fail for every item
        }
        if (err.status === 0 || err.status === 429 || err.status >= 500) break; // retrying the rest now would not help
      }
    }

    submitting.current = false;
    setBusy(false);
    if (placed.length > 0) {
      cart.removeMany(placed.map((p) => p.productId));
      if (Object.keys(failed).length === 0) forgetCheckout();
      navigate('/order-placed', { replace: true, state: { orders: placed, signedIn, notPlaced: orderable.filter((l) => failed[l.product.id]).map((l) => ({ name: l.product.name, reason: failed[l.product.id] })) } });
      return;
    }
    setFailures(failed);
    reload({ silent: true });
  }

  return (
    <Container>
      <PageTitle title="Checkout" subtitle="Send your order request. The potter will call you to agree the final price: nothing is charged online." />
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <form onSubmit={submit} noValidate className="grid items-start gap-8 pb-8 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-6">
            {!signedIn && auth.status !== 'loading' && (
              <p className="flex flex-wrap items-center gap-x-2 rounded-2xl bg-terracotta-50 px-4 py-3 text-sm text-terracotta-700">
                <Icon name="user" className="h-4 w-4" /> Have an account?
                <Link to="/login" state={{ from: '/checkout' }} className="font-medium underline">Sign in</Link> to use saved addresses and track your orders in one place, or continue as a guest.
              </p>
            )}
            {needsProfile && (
              <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your account has no profile yet. <Link to="/account" className="font-medium underline">Complete your profile</Link> before ordering.
              </p>
            )}

            <fieldset className="space-y-4 rounded-3xl border border-sand bg-white/70 p-6">
              <legend className="px-2 font-display text-xl text-clay-brown">Delivery details</legend>
              {signedIn && (profile?.addresses?.length ?? 0) > 0 && (
                <SelectField label="Saved address" value={addressId} onChange={(e) => useSaved(e.target.value)} placeholder="Enter a different address" options={profile.addresses.map((a) => ({ value: a.id, label: `${a.label}: ${a.line.slice(0, 40)}` }))} />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Your name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} maxLength={100} />
                <TextField label="Phone number" required type="tel" inputMode="tel" autoComplete="tel" placeholder="01712345678" hint="The potter will call this number." value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
              </div>
              <TextField label="Delivery address" required multiline autoComplete="street-address" hint="House, road, area: enough for a courier to find you." value={form.address} onChange={set('address')} error={errors.address} maxLength={300} />
              <SelectField label="District" required placeholder="Choose your district" options={districts.data ?? (form.district ? [form.district] : [])} value={form.district} onChange={set('district')} error={errors.district} />
            </fieldset>

            {formError && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
            {Object.keys(failures).length > 0 && (
              <ul role="alert" className="space-y-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {Object.entries(failures).map(([id, msg]) => <li key={id}>{lines.find((l) => l.product?.id === id)?.product.name ?? 'An item'}: {msg}</li>)}
              </ul>
            )}
          </div>

          <aside aria-label="Order summary" className="rounded-3xl border border-sand bg-white/80 p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-2xl text-clay-brown">Your order</h2>
            {loading ? (
              <div className="mt-4 space-y-3" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-sand/70">
                  {lines.map((l) => (
                    <li key={l.item.productId} className="flex gap-3 py-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-beige"><ProductImage src={l.product?.thumbUrl} alt="" /></div>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate font-medium text-clay-brown">{l.product?.name ?? 'Unavailable item'}</p>
                        {l.status === 'gone' || l.status === 'soldout' ? (
                          <p className="text-xs text-red-700">{l.status === 'gone' ? 'No longer available' : 'Sold out'}: not included. <button type="button" className="underline" onClick={() => cart.remove(l.item.productId)}>Remove</button></p>
                        ) : (
                          <>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <QuantityStepper value={l.item.quantity} max={l.product.stock} onChange={(q) => cart.set(l.item.productId, q, l.product.stock)} label={`Quantity of ${l.product.name}`} disabled={busy} />
                              <span className="font-semibold text-terracotta-700">{formatBdt(l.product.price * l.effectiveQuantity)}</span>
                            </div>
                            {l.status === 'reduced' && <p className="mt-1 text-xs text-amber-800">Only {l.product.stock} available. <button type="button" className="underline" onClick={() => cart.set(l.item.productId, l.product.stock, l.product.stock)}>Update to {l.product.stock}</button></p>}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-baseline justify-between border-t border-sand pt-4">
                  <span className="font-medium">Subtotal</span>
                  <span className="text-2xl font-semibold text-terracotta-700">{formatBdt(total)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-clay-soft">Listed prices. The final price is agreed with the potter by phone. Your order is only a request until the potter has spoken to you.</p>
                {excluded.length > 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{excluded.length} unavailable {excluded.length === 1 ? 'item is' : 'items are'} left out of this order.</p>}
                <Button type="submit" size="lg" className="mt-5 w-full" loading={busy} disabled={orderable.length === 0 || reduced.length > 0 || needsProfile || loading}>
                  Send order request
                </Button>
                {reduced.length > 0 && <p className="mt-2 text-center text-xs text-amber-800">Update the highlighted quantities first.</p>}
              </>
            )}
            <Link to="/cart" className="mt-4 block text-center text-sm text-terracotta-700 hover:underline">Back to cart</Link>
          </aside>
        </form>
      )}
    </Container>
  );
}

/** Used by the router: a visit to /order-placed without a fresh order goes home instead of showing an empty page. */
export const RedirectHome = () => <Navigate to="/" replace />;
