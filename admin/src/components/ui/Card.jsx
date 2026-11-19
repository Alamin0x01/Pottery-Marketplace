export function Card({ title, subtitle, action, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-xl border border-line bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-charcoal">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-charcoal-soft">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
