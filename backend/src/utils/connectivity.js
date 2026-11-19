export const DEFAULT_ONLINE_WINDOW_SEC = 900;

/**
 * online / offline / never_seen, derived from `lastSeen`. Connectivity is computed, never stored: a device that
 * has lost power or signal cannot report itself offline, so "offline" can only mean "silent for too long".
 */
export function connectivityOf(device, { onlineWindowSec = DEFAULT_ONLINE_WINDOW_SEC, now = new Date() } = {}) {
  if (!device.lastSeen) return 'never_seen';
  return now.getTime() - new Date(device.lastSeen).getTime() <= onlineWindowSec * 1000 ? 'online' : 'offline';
}

/**
 * Adds `connectivity` and `displayStatus` to a device view. The stored `status` is administrative
 * (unassigned/active/disabled/lost); `displayStatus` additionally shows an `active` device that has gone
 * silent as `offline`.
 */
export function withConnectivity(device, options) {
  const connectivity = connectivityOf(device, options);
  const displayStatus = device.status === 'active' && connectivity !== 'online' ? 'offline' : device.status;
  return { ...device, connectivity, displayStatus };
}
