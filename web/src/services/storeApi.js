import { api } from '../api/client.js';

// One module for every backend call: components never use axios directly. Contracts: docs/API_DESIGN.md §4, §12.
const get = (path, params, signal, headers) => api.get(path, { params, signal, headers }).then((r) => r.data);

/** Drops empty filter values so they are not sent as `?q=`. */
const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const storeApi = {
  products: (params, signal) => get('/products', clean(params), signal),
  product: (id, signal) => get(`/products/${encodeURIComponent(id)}`, undefined, signal).then((r) => r.product),
  categories: (signal) => get('/categories', undefined, signal).then((r) => r.items),
  featuredPotters: (signal) => get('/potters/featured', undefined, signal).then((r) => r.items),
  districts: (signal) => get('/districts', undefined, signal).then((r) => r.items),

  me: (signal) => get('/customers/me', undefined, signal),
  saveProfile: (body) => api.patch('/customers/me', body).then((r) => r.data.customer),
  myOrders: (params, signal) => get('/customers/me/orders', clean(params), signal),
  addAddress: (body) => api.post('/customers/me/addresses', body).then((r) => r.data.addresses),
  updateAddress: (id, body) => api.patch(`/customers/me/addresses/${id}`, body).then((r) => r.data.addresses),
  removeAddress: (id) => api.delete(`/customers/me/addresses/${id}`).then((r) => r.data.addresses),

  /** `idempotencyKey` makes a retry of the same request safe. Returns `{ orderId, trackingToken, status, replayed }`. */
  placeOrder: (body, idempotencyKey) => api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data),
  /** Owner (signed in) or guest with `trackingToken`. */
  order: (id, trackingToken, signal) =>
    get(`/orders/${id}`, undefined, signal, trackingToken ? { 'X-Tracking-Token': trackingToken } : undefined).then((r) => r.order),
};
