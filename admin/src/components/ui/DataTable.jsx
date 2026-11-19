/**
 * Responsive table. `columns`: [{ key, header, render(row), className, hideBelow: 'sm'|'md'|'lg' }].
 * Columns marked `hideBelow` are hidden on narrower screens so the table stays readable on phones.
 */
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable({ columns, rows, rowKey = (r) => r.id, caption }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line bg-stone-50/60 text-xs uppercase tracking-wide text-charcoal-soft">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-5 py-2.5 font-medium ${HIDE[c.hideBelow] ?? ''} ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-stone-50/70">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 align-middle ${HIDE[c.hideBelow] ?? ''} ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
