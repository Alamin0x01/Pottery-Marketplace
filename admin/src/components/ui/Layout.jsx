import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';

/** Page title row: optional back link, title with badge, subtitle and action buttons (wrap on phones). */
export function PageHeader({ title, subtitle, badge, back, actions }) {
  return (
    <div className="space-y-2">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1 text-xs font-medium text-charcoal-soft hover:text-charcoal">
          <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-charcoal">
            <span className="break-words">{title}</span>
            {badge}
          </h1>
          {subtitle && <p className="mt-0.5 text-sm text-charcoal-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Label/value pairs in a responsive grid. Items with a nullish `value` are skipped unless `always` is set. */
export function DetailList({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
      {items.map(({ label, value, always }) =>
        value === undefined || value === null || value === '' ? (always ? (
          <div key={label}><dt className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">{label}</dt><dd className="mt-1 text-sm text-charcoal-soft">—</dd></div>
        ) : null) : (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">{label}</dt>
            <dd className="mt-1 break-words text-sm text-charcoal">{value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

/** Tab strip driven by the parent (so the active tab can live in the URL). */
export function Tabs({ tabs, active, onChange, label = 'Sections' }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${active === t.id ? 'border-terracotta-500 text-terracotta-700' : 'border-transparent text-charcoal-soft hover:text-charcoal'}`}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-xs text-charcoal-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ id, children }) => (
  <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>
);
