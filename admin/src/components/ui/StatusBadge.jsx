import { TONES } from '../../utils/constants.js';

/** Pill for a status value. `meta` is a map like ORDER_STATUS_META; unknown values render as plain text. */
export function StatusBadge({ value, meta }) {
  const entry = meta?.[value];
  const tone = TONES[entry?.tone ?? 'neutral'];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {entry?.label ?? value}
    </span>
  );
}
