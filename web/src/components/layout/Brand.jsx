export function Logo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#a8502f" />
      <path d="M17 9h6v3c0 3 7 5 7 12 0 6-4 9-7 9h-6c-3 0-7-3-7-9 0-7 7-9 7-12z" fill="#fdf8f0" />
      <path d="M13 22c4 2 10 2 14 0" stroke="#a8502f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ light = false }) {
  return (
    <span className="flex items-center gap-3">
      <Logo />
      <span className="leading-none">
        <span className={`block font-display text-2xl font-semibold tracking-tight ${light ? 'text-cream' : 'text-clay-brown'}`}>Mati</span>
        <span className={`mt-1 block text-[10px] uppercase tracking-[0.22em] ${light ? 'text-sand' : 'text-clay-soft'}`}>Handmade pottery</span>
      </span>
    </span>
  );
}
