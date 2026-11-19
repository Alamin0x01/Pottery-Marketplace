import { Link } from 'react-router-dom';
import { Container, PageTitle } from '../components/layout/Layout.jsx';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { QuantityStepper } from '../components/ui/QuantityStepper.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { ProductImage } from '../components/shop/ProductImage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCartLines } from '../hooks/useCartLines.js';
import { formatBdt } from '../utils/format.js';

const PROBLEM = {
  gone: 'No longer available',
  soldout: 'Sold out',
};

function Line({ line, onQuantity, onRemove }) {
  const { item, product, status, effectiveQuantity } = line;
  const problem = status === 'gone' || status === 'soldout';
  return (
    <li className={`flex gap-4 rounded-3xl border bg-white/70 p-4 sm:gap-6 sm:p-5 ${problem ? 'border-red-200' : 'border-sand'}`}>
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-beige sm:h-32 sm:w-32">
        <ProductImage src={product?.thumbUrl} alt={product?.name ?? 'Unavailable product'} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {product ? (
              <Link to={`/shop/${product.id}`} className="block truncate font-display text-lg text-clay-brown hover:text-terracotta-700 sm:text-xl">{product.name}</Link>
            ) : (
              <p className="font-display text-lg text-clay-soft">Unavailable product</p>
            )}
            {product && <p className="truncate text-sm text-clay-soft">{product.seller.name} · {product.seller.village}</p>}
          </div>
          <button type="button" onClick={onRemove} aria-label={`Remove ${product?.name ?? 'item'} from cart`} className="rounded-full p-2 text-clay-soft transition hover:bg-red-50 hover:text-red-700"><Icon name="trash" className="h-5 w-5" /></button>
        </div>

        {problem ? (
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">{PROBLEM[status]}: this item will not be included in your order. Please remove it.</p>
        ) : (
          <>
            {status === 'reduced' && (
              <p role="alert" className="mt-2 text-sm text-amber-800">
                Only {product.stock} available (you asked for {item.quantity}).{' '}
                <button type="button" onClick={() => onQuantity(effectiveQuantity)} className="font-medium underline">Update to {effectiveQuantity}</button>
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
              <QuantityStepper value={status === 'reduced' ? item.quantity : item.quantity} max={product.stock} onChange={onQuantity} label={`Quantity of ${product.name}`} />
              <p className="text-right">
                <span className="block text-xs text-clay-soft">{formatBdt(product.price)} each</span>
                <span className="text-lg font-semibold text-terracotta-700">{formatBdt(product.price * effectiveQuantity)}</span>
              </p>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export function CartPage() {
  const cart = useCart();
  const { lines, total, loading, error, reload } = useCartLines(cart.items);
  const orderable = lines.filter((l) => l.effectiveQuantity > 0);
  const hasProblem = lines.some((l) => l.status !== 'ok');

  return (
    <Container>
      <PageTitle title="Your cart" subtitle={cart.items.length > 0 ? 'Review your pieces. Prices and availability are checked with the shop each time.' : undefined} />
      {cart.items.length === 0 ? (
        <EmptyState icon="bag" title="Your cart is empty" description="Find something you love in the shop and it will wait for you here." action={<ButtonLink to="/shop">Browse the shop</ButtonLink>} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4" aria-busy="true">{cart.items.map((i) => <Skeleton key={i.productId} className="h-36 w-full !rounded-3xl" />)}</div>
      ) : (
        <div className="grid items-start gap-8 pb-8 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-4">
            {lines.map((line) => (
              <Line
                key={line.item.productId}
                line={line}
                onQuantity={(q) => cart.set(line.item.productId, q, line.product?.stock)}
                onRemove={() => cart.remove(line.item.productId)}
              />
            ))}
          </ul>

          <aside aria-label="Order summary" className="rounded-3xl border border-sand bg-white/80 p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-2xl text-clay-brown">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-clay-soft">Pieces</dt><dd>{orderable.reduce((n, l) => n + l.effectiveQuantity, 0)}</dd></div>
              <div className="flex justify-between border-t border-sand pt-3 text-base"><dt className="font-medium">Subtotal</dt><dd className="text-xl font-semibold text-terracotta-700">{formatBdt(total)}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-clay-soft">This is the listed price. There is no online payment: the potter calls you to agree the final price and delivery.</p>
            {hasProblem && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Some items need attention. Unavailable items are left out of the order.</p>}
            {orderable.length > 0 ? (
              <ButtonLink to="/checkout" size="lg" className="mt-5 w-full">Continue to checkout</ButtonLink>
            ) : (
              <Button size="lg" className="mt-5 w-full" disabled>Nothing to order</Button>
            )}
            <Link to="/shop" className="mt-4 block text-center text-sm text-terracotta-700 hover:underline">Continue shopping</Link>
          </aside>
        </div>
      )}
    </Container>
  );
}
