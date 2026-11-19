const BDT = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat('en-US');

export const formatNumber = (n) => (Number.isFinite(n) ? NUMBER.format(n) : '—');
export const formatBdt = (n) => (Number.isFinite(n) ? BDT.format(n) : '—');

export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a short date. `now` is injectable for tests. */
export function formatRelative(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 7 * 86_400) return `${Math.round(seconds / 86_400)} d ago`;
  return new Date(then).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function initials(nameOrEmail) {
  const source = (nameOrEmail ?? '').trim();
  if (!source) return '?';
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

/** "15 minutes", "1 hour", used in tooltips about the device online window. */
export function formatDuration(seconds) {
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  return `${Math.round(seconds / 60)} minutes`;
}
