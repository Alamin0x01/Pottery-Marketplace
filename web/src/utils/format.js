const NUMBER = new Intl.NumberFormat('en-US');

/** Prices are whole taka: "৳ 1,250". */
export const formatBdt = (n) => (Number.isFinite(n) ? `৳ ${NUMBER.format(n)}` : '—');

export function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "01712345678" -> "01712-345678" */
export const formatPhone = (phone) => (/^01\d{9}$/.test(phone ?? '') ? `${phone.slice(0, 5)}-${phone.slice(5)}` : (phone ?? '—'));

/** Stock wording that never overstates: exact count only when it is small. */
export function stockLabel(product) {
  if (!product.available || !(product.stock > 0)) return { text: 'Sold out', tone: 'out' };
  if (product.stock <= 3) return { text: `Only ${product.stock} left`, tone: 'low' };
  return { text: 'In stock', tone: 'in' };
}
