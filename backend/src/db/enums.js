// Single source of truth for enumerated values (see docs/DATABASE_DESIGN.md).
export const POTTER_STATUS = ['active', 'inactive'];
export const DEVICE_STATUS = ['unassigned', 'active', 'disabled', 'lost'];
export const PRODUCT_STATUS = ['draft', 'pending_review', 'approved', 'rejected', 'removed', 'suspended'];
export const AI_STATUS = ['queued', 'processing', 'done', 'failed'];
export const CATEGORIES = ['Home Decoration', 'Kitchenware', 'Garden', 'Tableware', 'Storage', 'Other'];
export const IMAGE_KINDS = ['original', 'web', 'thumb'];
export const ORDER_STATUS = [
  'pending',
  'seller_notified',
  'contacted',
  'price_negotiation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];
export const TERMINAL_ORDER_STATUS = ['delivered', 'cancelled'];
export const ATTENTION_REASONS = ['no_active_device', 'device_offline', 'unacknowledged', 'manual'];
export const NOTIFICATION_TYPES = ['NEW_ORDER', 'ORDER_CANCELLED'];
export const NOTIFICATION_STATUS = ['pending', 'delivered', 'acknowledged', 'expired'];
export const ADMIN_ROLES = ['admin', 'superadmin'];
export const ACTOR_TYPES = ['admin', 'system', 'device'];
export const DEVICE_EVENT_TYPES = ['heartbeat', 'rejected'];

// Allowed manual/system product transitions. `suspended` is entered/left only through
// suspendAllForPotter / restoreAllForPotter (potter deactivation/reactivation).
export const PRODUCT_TRANSITIONS = Object.freeze({
  draft: ['pending_review', 'removed'],
  pending_review: ['approved', 'rejected', 'removed'],
  approved: ['pending_review', 'removed'],
  rejected: ['pending_review', 'removed'],
  suspended: ['removed'],
  removed: [],
});
