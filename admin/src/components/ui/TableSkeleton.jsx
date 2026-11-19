import { Skeleton } from './States.jsx';

/** Placeholder rows while a table loads. */
export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
    </div>
  );
}
