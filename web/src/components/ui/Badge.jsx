import { TONES } from '../../utils/constants.js';
import { ORDER_STATUS_META } from '../../utils/constants.js';

export function Badge({ tone = 'neutral', children }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function OrderStatusBadge({ status }) {
  const meta = ORDER_STATUS_META[status];
  return <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? status}</Badge>;
}
