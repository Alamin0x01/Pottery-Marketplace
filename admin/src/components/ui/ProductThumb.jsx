import { useState } from 'react';

// Demo products reference static images (`/images/products/<file>`) that the build shares with the customer site.
// Anything else (e.g. a private device upload path) is not displayable here and shows the placeholder.
const STATIC_IMAGE = /^\/images\/products\/[\w-][\w.-]*\.(?:jpe?g|png|webp|avif)$/i;

export function productImageSrc(product) {
  const images = product?.images ?? [];
  const best = images.find((i) => i.kind === 'thumb') ?? images.find((i) => i.kind === 'web');
  return best && STATIC_IMAGE.test(best.path) ? best.path : null;
}

export function ProductThumb({ product, className = 'h-10 w-10' }) {
  const [failed, setFailed] = useState(false);
  const src = productImageSrc(product);
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-lg bg-beige`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-wide text-charcoal-soft" role="img" aria-label="No photo">No photo</div>
      )}
    </div>
  );
}
