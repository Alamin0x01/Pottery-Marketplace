/**
 * Column chart drawn with SVG. `data`: [{ label, value }]. Every bar has a <title> tooltip and the whole
 * chart has an accessible description. A flat baseline is drawn when every value is 0 (no fake bars).
 */
export function BarChart({ data, ariaLabel, height = 180 }) {
  const width = 560;
  const pad = { top: 12, right: 8, bottom: 26, left: 28 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const inner = { w: width - pad.left - pad.right, h: height - pad.top - pad.bottom };
  const slot = inner.w / data.length;
  const barW = Math.min(28, slot * 0.6);
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => {
        const y = pad.top + inner.h - (t / niceMax) * inner.h;
        return (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e9e2d8" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#8a8178">{t}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / niceMax) * inner.h;
        const x = pad.left + i * slot + (slot - barW) / 2;
        return (
          <g key={d.label}>
            <rect x={x} y={pad.top + inner.h - h} width={barW} height={Math.max(h, d.value > 0 ? 2 : 0)} rx="3" className="fill-terracotta-500 transition-opacity hover:opacity-80">
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {(i % 2 === data.length % 2 || data.length < 8) && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="#8a8178">{d.short ?? d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal proportion bars: [{ label, value, color }] against `total`. */
export function ProportionBars({ rows, total }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-charcoal-soft">{r.label}</span>
            <span className="font-medium text-charcoal">{r.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${r.color}`} style={{ width: total > 0 ? `${(r.value / total) * 100}%` : '0%' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One stacked bar: segments [{ label, value, color }], with a legend underneath. */
export function StackedBar({ segments, ariaLabel }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100" role="img" aria-label={ariaLabel}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
    </div>
  );
}
