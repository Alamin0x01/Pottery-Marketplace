import { api } from '../api/client.js';

// One module per resource group: components never call axios directly. Contracts mirror
// docs/API_DESIGN.md and backend/src/routes/admin.
const get = (path, params, signal) => api.get(path, { params, signal }).then((r) => r.data);
const send = (method, path, data, signal) => api.request({ method, url: path, data, signal }).then((r) => r.data);

/** Drops empty filter values so they are not sent as `?q=`. */
const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const adminApi = {
  /** Identity as verified by the backend from the ID token. 403 means "signed in but not an admin". */
  me: (signal) => get('/admin/me', undefined, signal),
  meta: (signal) => get('/admin/meta', undefined, signal),
  dashboard: (signal) => get('/admin/dashboard', undefined, signal),
  activity: ({ limit = 10 } = {}, signal) => get('/admin/activity', { limit }, signal),
  orders: (params = {}, signal) => get('/admin/orders', clean(params), signal),
  products: (params = {}, signal) => get('/admin/products', clean(params), signal),
  search: (q, signal) => get('/admin/search', { q }, signal),
  /** Superadmin only. */
  admins: ({ limit = 50 } = {}, signal) => get('/admin/admins', { limit }, signal),

  potters: {
    list: (params, signal) => get('/admin/potters', clean(params), signal),
    get: (id, signal) => get(`/admin/potters/${id}`, undefined, signal),
    create: (body) => send('post', '/admin/potters', body),
    update: (id, body) => send('patch', `/admin/potters/${id}`, body),
    setStatus: (id, status) => send('patch', `/admin/potters/${id}/status`, { status }),
  },

  devices: {
    list: (params, signal) => get('/admin/devices', clean(params), signal),
    get: (id, signal) => get(`/admin/devices/${id}`, undefined, signal),
    events: (id, params, signal) => get(`/admin/devices/${id}/events`, clean(params), signal),
    audit: (id, params, signal) => get(`/admin/devices/${id}/audit`, clean(params), signal),
    /** Returns `{ device, provisioning }`; `provisioning.secret` exists only in this response. */
    register: (body) => send('post', '/admin/devices', body),
    assign: (deviceId, potterId) => send('post', '/admin/devices/assign', { deviceId, potterId }),
    setStatus: (id, status, reason) => send('patch', `/admin/devices/${id}/status`, { status, ...(reason ? { reason } : {}) }),
    revoke: (id, reason) => send('post', `/admin/devices/${id}/revoke`, reason ? { reason } : {}),
    /** Returns `{ device, provisioning }` with a brand-new secret (shown once). */
    issueCredentials: (id) => send('post', `/admin/devices/${id}/credentials`, {}),
  },
};
