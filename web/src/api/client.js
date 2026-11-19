import axios from 'axios';
import { getFirebaseAuth } from '../lib/firebase.js';

const baseURL = import.meta.env.VITE_API_URL;
if (!baseURL) {
  throw new Error('VITE_API_URL is not set. Copy .env.example to .env.local.');
}

export const api = axios.create({ baseURL, timeout: 15000 });

/** Normalised error thrown by every API call: `{ status, code, message, requestId, details }`. status 0 = no response. */
export class ApiClientError extends Error {
  constructor({ status, code, message, requestId, details }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export function toApiClientError(error) {
  const payload = error.response?.data?.error;
  if (error.response) {
    return new ApiClientError({
      status: error.response.status,
      code: payload?.code ?? 'HTTP_ERROR',
      message: payload?.message ?? `Request failed (${error.response.status})`,
      requestId: payload?.requestId,
      details: payload?.details,
    });
  }
  const timedOut = error.code === 'ECONNABORTED';
  return new ApiClientError({
    status: 0,
    code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
    message: timedOut ? 'The server took too long to respond. Please try again.' : 'Cannot reach the server. Check your connection and try again.',
  });
}

// Only customer and order requests carry the Firebase ID token; the public catalogue never needs it, so an expired
// session can never break browsing. The role/identity is read by the backend from the verified token, never sent.
const needsToken = (url = '') => url.startsWith('/customers') || url.startsWith('/orders');

let onSessionInvalid = () => {};
/** Registered by AuthContext: called when the session can no longer be used (token rejected even after a refresh). */
export const setSessionInvalidHandler = (fn) => {
  onSessionInvalid = fn;
};

api.interceptors.request.use(async (config) => {
  if (needsToken(config.url)) {
    const user = getFirebaseAuth().currentUser;
    if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error) || error instanceof ApiClientError) throw error;
    const original = error.config;
    const user = needsToken(original?.url) ? getFirebaseAuth().currentUser : null;
    if (error.response?.status === 401 && user && !original._retried) {
      original._retried = true;
      try {
        await user.getIdToken(true); // refresh once, then replay the request
      } catch {
        onSessionInvalid();
        throw toApiClientError(error);
      }
      return api(original);
    }
    const normalised = toApiClientError(error);
    if (normalised.status === 401 && user) onSessionInvalid();
    throw normalised;
  },
);
