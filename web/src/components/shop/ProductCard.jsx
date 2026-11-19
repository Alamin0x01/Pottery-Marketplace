import { Link } from 'react-router-dom';
import { ProductImage } from './ProductImage.jsx';
import { Skeleton } from '../ui/States.jsx';
import { formatBdt, stockLabel } from '../../utils/format.js';

export function ProductCard({ product, index = 0 }) {
  const stock = stockLabel(product);
  return (
    <article className="group animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <Link to={`/shop/${product.id}`} className="block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-4 focus-visible:ring-offset-cream">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-beige shadow-sm ring-1 ring-sand/60 transition duration-300 group-hover:shadow-lg group-hover:ring-terracotta-200">
          <ProductImage src={product.thumbUrl ?? product.imageUrl} alt={product.name} className="transition duration-500 ease-out group-hover:scale-105" />
          <span className="absolute left-3 top-3 rounded-full bg-cream/90 px-3 py-1 text-xs font-medium text-clay-brown backdrop-blur">{product.category}</span>
          {stock.tone === 'low' && <span className="absolute bottom-3 right-3 rounded-full bg-terracotta-600 px-3 py-1 text-xs font-medium text-white">{stock.text}</span>}
        </div>
        <div className="px-1 pt-3">
          <h3 className="text-lg leading-snug text-clay-brown transition-colors group-hover:text-terracotta-700">{product.name}</h3>
          <p className="mt-0.5 text-sm text-clay-soft">{product.seller.name} · {product.seller.village}, {product.seller.district}</p>
          <p className="mt-1.5 text-base font-semibold text-terracotta-700">{formatBdt(product.price)}</p>
        </div>
      </Link>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full !rounded-3xl" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-2 h-5 w-1/4" />
    </div>
  );
}

export function ProductGrid({ children }) {
  return <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
