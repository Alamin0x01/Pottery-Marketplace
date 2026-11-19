import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { Skeleton } from './States.jsx';

const ACCENTS = {
  brand: 'bg-terracotta-50 text-terracotta-600',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-stone-100 text-stone-600',
};

/** One headline number. `to` makes the whole card a link; `loading` shows a skeleton instead of a fake value. */
export function StatCard({ label, value, hint, icon, accent = 'brand', to, loading }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-charcoal-soft">{label}</p>
        <span className={`rounded-lg p-2 ${ACCENTS[accent]}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-tight text-charcoal" data-testid={`stat-${label}`}>{value}</p>
      )}
      {loading ? <Skeleton className="mt-2 h-3 w-28" /> : hint && <p className="mt-1 text-xs text-charcoal-soft">{hint}</p>}
    </>
  );
  const base = 'block rounded-xl border border-line bg-white p-5 shadow-sm';
  return to ? (
    <Link to={to} className={`${base} transition hover:border-terracotta-100 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
