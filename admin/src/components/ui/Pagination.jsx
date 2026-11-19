import { Button } from './Button.jsx';

/** Previous/Next for cursor-paginated lists (the backend does not expose total counts for filtered queries). */
export function Pagination({ page, hasPrev, hasNext, onPrev, onNext, loading, count }) {
  if (!hasPrev && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-charcoal-soft">
      <span>Page {page}{typeof count === 'number' && <> · {count} shown</>}</span>
      <span className="flex gap-2">
        <Button onClick={onPrev} disabled={!hasPrev || loading}>Previous</Button>
        <Button onClick={onNext} disabled={!hasNext || loading}>Next</Button>
      </span>
    </nav>
  );
}
