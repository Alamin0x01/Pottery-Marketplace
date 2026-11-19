export const COLLECTIONS = Object.freeze({
  potters: 'potters',
  devices: 'devices',
  products: 'products',
  customers: 'customers',
  orders: 'orders',
  notifications: 'notifications',
  orderHistory: 'order_history',
  admins: 'admins',
  counters: 'counters',
  uploads: 'uploads',
  auditLogs: 'audit_logs',
  // One document per device communication (heartbeat, or a rejected contact from a disabled/lost device).
  deviceEvents: 'device_events',
  // Unique-phone reservation: document ID = normalised phone, so two potters can never share a number.
  potterPhones: 'potter_phones',
  // Created in Phase 7 (order creation); named here so rules/docs/tests cover every collection.
  idempotencyKeys: 'idempotency_keys',
  blockedPhones: 'blocked_phones',
});

export const COUNTER_NAMES = Object.freeze({ potter: 'potter', device: 'device' });
