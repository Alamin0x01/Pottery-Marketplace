import { Icon } from './Icon.jsx';

export function Spinner({ className = 'h-5 w-5' }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-terracotta-500 border-t-transparent ${className}`} />;
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded-lg bg-sand/60 ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon = 'box', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sand bg-white/50 px-6 py-14 text-center">
      <span className="mb-4 rounded-full bg-terracotta-50 p-4 text-terracotta-600"><Icon name={icon} className="h-7 w-7" /></span>
      <h2 className="text-xl text-clay-brown">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-clay-soft">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Error panel with retry. Network failures get specific wording. */
export function ErrorState({ error, onRetry, compact = false }) {
  const offline = error?.status === 0;
  return (
    <div role="alert" className={`flex flex-col items-center justify-center rounded-3xl border border-red-100 bg-red-50/50 text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'}`}>
      <span className="mb-3 rounded-full bg-red-100 p-3 text-red-700"><Icon name="alert" className="h-6 w-6" /></span>
      <p className="font-medium text-clay-brown">{offline ? 'Cannot reach the server' : 'Something went wrong'}</p>
      <p className="mt-1 max-w-sm text-sm text-clay-soft">{error?.message ?? 'Unexpected error.'}</p>
      {error?.requestId && <p className="mt-1 text-xs text-clay-soft/70">Reference: {error.requestId}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-full border border-sand bg-white px-4 py-1.5 text-sm font-medium text-clay-brown hover:border-terracotta-200">
          Try again
        </button>
      )}
    </div>
  );
}

export function PageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-clay-soft">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
