import { Icon } from './Icon.jsx';

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin text-terracotta-500 ${className}`} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded bg-stone-200/70 ${className}`} aria-hidden="true" />;
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-charcoal-soft">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = 'check', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 rounded-full bg-terracotta-50 p-3 text-terracotta-600">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="font-medium text-charcoal">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-charcoal-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error panel with a retry button. 403 and network failures get specific wording. */
export function ErrorState({ error, onRetry, compact = false }) {
  const forbidden = error?.status === 403;
  const offline = error?.status === 0;
  const title = forbidden ? 'You do not have permission to view this' : offline ? 'Cannot reach the server' : 'Something went wrong';
  return (
    <div role="alert" className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}>
      <span className="mb-3 rounded-full bg-red-50 p-3 text-red-600">
        <Icon name={forbidden ? 'lock' : 'alert'} className="h-6 w-6" />
      </span>
      <p className="font-medium text-charcoal">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-charcoal-soft">{error?.message ?? 'Unexpected error.'}</p>
      {error?.requestId && <p className="mt-1 text-xs text-stone-400">Reference: {error.requestId}</p>}
      {onRetry && !forbidden && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-charcoal transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500">
          Try again
        </button>
      )}
    </div>
  );
}
