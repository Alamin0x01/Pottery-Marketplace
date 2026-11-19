import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Container } from '../components/layout/Layout.jsx';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { QuantityStepper } from '../components/ui/QuantityStepper.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { ProductImage } from '../components/shop/ProductImage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { storeApi } from '../services/storeApi.js';
import { formatBdt, stockLabel } from '../utils/format.js';

const STOCK_TONE = { in: 'text-emerald-700', low: 'text-amber-700', out: 'text-red-700' };

function DetailsSkeleton() {
  return (
    <Container className="grid gap-10 py-10 md:grid-cols-2" >
      <Skeleton className="aspect-[4/3] w-full !rounded-3xl" />
      <div className="space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-1/2" /></div>
    </Container>
  );
}

export function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { data: product, error, loading, reload } = useAsync((signal) => storeApi.product(id, signal), [id]);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState(null);

  if (loading && !product) return <DetailsSkeleton />;
  if (error && !product) {
    const missing = error.status === 404 || error.status === 400;
    return (
      <Container className="py-16">
        {missing ? (
          <EmptyState icon="box" title="This piece is no longer available" description="It may have been sold or removed from the shop." action={<ButtonLink to="/shop">Back to the shop</ButtonLink>} />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </Container>
    );
  }

  const stock = stockLabel(product);
  const soldOut = !product.available;
  const inCart = cart.items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const qty = Math.min(quantity, Math.max(product.stock, 1));
  const facts = [
    ['Category', product.category],
    product.material && ['Material', product.material],
    ['Made by', product.seller.name],
    ['Location', `${product.seller.village}, ${product.seller.district}`],
  ].filter(Boolean);

  const addToCart = () => {
    const result = cart.add(product.id, qty, product.stock);
    if (result === 'cart-full') setNotice({ tone: 'error', text: 'Your cart is full. Remove something or order what is in it first.' });
    else if (result === 'at-limit') setNotice({ tone: 'info', text: `You already have all ${product.stock} available in your cart.` });
    else setNotice({ tone: 'ok', text: `${qty} × ${product.name} added to your cart.` });
  };
  const orderNow = () => {
    cart.set(product.id, qty, product.stock);
    navigate('/checkout');
  };

  return (
    <Container className="py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-clay-soft">
        <Link to="/shop" className="hover:text-terracotta-700">Shop</Link> <span aria-hidden="true">/</span>{' '}
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-terracotta-700">{product.category}</Link> <span aria-hidden="true">/</span>{' '}
        <span className="text-clay-brown">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="animate-fade-in">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-beige shadow-sm ring-1 ring-sand/60 lg:sticky lg:top-24">
            <ProductImage src={product.imageUrl} alt={product.name} eager />
          </div>
        </div>

        <div className="animate-fade-up">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta-600">{product.category}</p>
          <h1 className="mt-2 text-4xl leading-tight text-clay-brown sm:text-5xl">{product.name}</h1>
          <p className="mt-4 text-3xl font-semibold text-terracotta-700">{formatBdt(product.price)}</p>
          <p className="mt-1 text-xs text-clay-soft">Listed price per piece. The final price is agreed with the potter by phone.</p>
          <p className={`mt-4 flex items-center gap-2 text-sm font-medium ${STOCK_TONE[stock.tone]}`}>
            <span className={`h-2 w-2 rounded-full ${stock.tone === 'in' ? 'bg-emerald-500' : stock.tone === 'low' ? 'bg-amber-500' : 'bg-red-500'}`} aria-hidden="true" />
            {stock.text}{!soldOut && stock.tone === 'in' && ` · ${product.stock} available`}
          </p>

          <p className="mt-6 whitespace-pre-line leading-relaxed text-clay-brown/90">{product.description}</p>

          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-3xl border border-sand bg-white/60 p-6 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-clay-soft">{k}</dt><dd className="font-medium text-clay-brown">{v}</dd></div>
            ))}
          </dl>

          <div className="mt-8 space-y-4">
            {soldOut ? (
              <p role="status" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">This piece is sold out. <Link to="/shop" className="font-medium underline">Browse similar pottery</Link>.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4">
                  <QuantityStepper value={qty} max={product.stock} onChange={setQuantity} />
                  <span className="text-sm text-clay-soft">Subtotal <strong className="text-clay-brown">{formatBdt(product.price * qty)}</strong></span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button size="lg" onClick={orderNow}>Order now</Button>
                  <Button size="lg" variant="secondary" onClick={addToCart}><Icon name="bag" className="h-5 w-5" /> Add to cart</Button>
                </div>
                {inCart > 0 && !notice && <p className="text-sm text-clay-soft">{inCart} in your cart. <Link to="/cart" className="font-medium text-terracotta-700 underline">View cart</Link></p>}
              </>
            )}
            {notice && (
              <p role="status" className={`animate-fade-in rounded-2xl px-4 py-3 text-sm ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : notice.tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
                {notice.text} {notice.tone !== 'error' && <Link to="/cart" className="font-medium underline">View cart</Link>}
              </p>
            )}
          </div>

          <ul className="mt-8 space-y-2 text-sm text-clay-soft">
            <li className="flex items-start gap-2"><Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />No online payment. After you order, the potter contacts you to agree the final price.</li>
            <li className="flex items-start gap-2"><Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />Delivery details are arranged once the order is confirmed.</li>
          </ul>
        </div>
      </div>
    </Container>
  );
}
