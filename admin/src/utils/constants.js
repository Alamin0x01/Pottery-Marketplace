// Display metadata for backend enums. The backend is the authority for values (docs/API_DESIGN.md);
// unknown values are rendered as-is by StatusBadge so a new backend status never breaks the UI.
// tests/constants.test.js checks that every backend status is covered here.

export const TONES = {
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  brand: 'bg-terracotta-50 text-terracotta-700 ring-terracotta-100',
};

export const ORDER_STATUS_META = {
  pending: { label: 'Pending', tone: 'warning' },
  seller_notified: { label: 'Seller notified', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'info' },
  price_negotiation: { label: 'Price negotiation', tone: 'brand' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  processing: { label: 'Processing', tone: 'success' },
  shipped: { label: 'Shipped', tone: 'success' },
  delivered: { label: 'Delivered', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const PRODUCT_STATUS_META = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_review: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  removed: { label: 'Removed', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'warning' },
};

export const DEVICE_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  unassigned: { label: 'Unassigned', tone: 'neutral' },
  disabled: { label: 'Disabled', tone: 'warning' },
  lost: { label: 'Lost', tone: 'danger' },
  // Derived, never stored: an `active` device that stopped contacting the server (see backend utils/connectivity.js).
  offline: { label: 'Offline', tone: 'warning' },
};

export const CONNECTIVITY_META = {
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'warning' },
  never_seen: { label: 'Never connected', tone: 'neutral' },
};

/** Options of the device status filter (the backend accepts exactly these values). */
export const DEVICE_FILTER_OPTIONS = ['active', 'offline', 'unassigned', 'disabled', 'lost'];

export const POTTER_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
};

export const ROLE_META = {
  superadmin: { label: 'Superadmin', tone: 'brand' },
  admin: { label: 'Admin', tone: 'info' },
};

/** Status metadata by entity type, used by search results and badges. */
export const STATUS_META = {
  order: ORDER_STATUS_META,
  product: PRODUCT_STATUS_META,
  device: DEVICE_STATUS_META,
  potter: POTTER_STATUS_META,
};

/** Sidebar. `phase` says when a not-yet-built section arrives (shown on its placeholder page). */
export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: 'overview', end: true },
  { to: '/potters', label: 'Potters', icon: 'potters' },
  { to: '/devices', label: 'Devices', icon: 'devices' },
  { to: '/products', label: 'Products', icon: 'products', phase: 'Phase 5', blurb: 'Review AI-generated listings, edit details, set prices, approve, reject or remove products.' },
  { to: '/orders', label: 'Orders', icon: 'orders', phase: 'Phase 7', blurb: 'View and filter orders, update status, record negotiated prices and track delivery.' },
  { to: '/customers', label: 'Customers', icon: 'customers', phase: 'Phase 7', blurb: 'Customer accounts and order history arrive together with order management.' },
  { to: '/reports', label: 'Reports', icon: 'reports', phase: 'Phase 10', blurb: 'Product, potter, order and device-connectivity statistics.' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Human wording for audit-log actions (see backend repositories). Unknown actions fall back to the raw code. */
export const ACTIVITY_VERBS = {
  'potter.create': 'registered potter',
  'potter.update': 'edited potter',
  'potter.activate': 'activated potter',
  'potter.deactivate': 'deactivated potter',
  'device.register': 'registered device',
  'device.assign': 'assigned device',
  'device.reassign': 'reassigned device',
  'device.enable': 'enabled device',
  'device.disable': 'disabled device',
  'device.mark_lost': 'marked device lost',
  'device.revoke_credential': 'revoked the credentials of device',
  'device.rotate_secret': 'issued new credentials for device',
  'product.approved': 'approved product',
  'product.rejected': 'rejected product',
  'product.removed': 'removed product',
  'product.pending_review': 'moved to review product',
  'admin.grant': 'granted admin access to',
  'admin.revoke': 'removed admin access from',
};
