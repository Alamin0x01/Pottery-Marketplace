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
    message: timedOut ? 'The server took too long to respond.' : 'Cannot reach the server. Check your connection.',
  });
}

// Set by AuthContext: called when the session can no longer be used (token rejected even after a refresh).
let onSessionInvalid = () => {};
export const setSessionInvalidHandler = (fn) => {
  onSessionInvalid = fn;
};

// The Firebase ID token is attached to every request; the SDK refreshes it automatically when it expires.
// The role is never sent: the backend reads it from the verified token.
api.interceptors.request.use(async (config) => {
  const user = getFirebaseAuth().currentUser;
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error) || error instanceof ApiClientError) throw error;
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried) {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        original._retried = true;
        try {
          await user.getIdToken(true); // force a refresh once, then replay the request
        } catch {
          onSessionInvalid(); // refresh impossible (account disabled/removed, or tokens revoked)
          throw toApiClientError(error);
        }
        return api(original); // a second 401 is normalised and reported by this same interceptor
      }
    }
    const normalised = toApiClientError(error);
    if (normalised.status === 401) onSessionInvalid();
    throw normalised;
  },
);
