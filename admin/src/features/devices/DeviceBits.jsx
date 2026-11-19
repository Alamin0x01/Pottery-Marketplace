import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { CONNECTIVITY_META, DEVICE_STATUS_META } from '../../utils/constants.js';
import { formatDateTime, formatRelative } from '../../utils/format.js';

/** Badge from the backend's `displayStatus` (active devices that went silent show as Offline). */
export const DeviceStatusBadge = ({ device }) => <StatusBadge value={device.displayStatus ?? device.status} meta={DEVICE_STATUS_META} />;

export const ConnectivityBadge = ({ device }) => <StatusBadge value={device.connectivity} meta={CONNECTIVITY_META} />;

/** "5 min ago" with the exact time as a tooltip; "Never" for devices that have not connected yet. */
export function LastSeen({ value }) {
  if (!value) return <span className="text-charcoal-soft">Never</span>;
  return <time dateTime={value} title={formatDateTime(value)} className="text-charcoal-soft">{formatRelative(value)}</time>;
}
