import { useState } from 'react';

/** Shown when a product has no photo yet (or the photo fails to load). It says so plainly instead of faking a photograph. */
export function ImagePlaceholder({ className = '' }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-cream to-beige text-terracotta-500/70 ${className}`} role="img" aria-label="Photo not available">
      <svg viewBox="0 0 120 120" className="h-1/2 w-1/2 max-w-32" fill="currentColor" aria-hidden="true">
        <path d="M50 14h20v10c0 10 24 18 24 42 0 22-12 34-24 34H50C38 100 26 88 26 66c0-24 24-32 24-42z" opacity=".85" />
        <ellipse cx="60" cy="14" rx="14" ry="3.5" opacity=".6" />
      </svg>
      <span className="text-[11px] uppercase tracking-widest text-clay-soft/70">Photo coming soon</span>
    </div>
  );
}

export function ProductImage({ src, alt, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <ImagePlaceholder className={className} />;
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
