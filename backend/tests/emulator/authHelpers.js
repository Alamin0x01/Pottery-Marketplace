import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';

const authBase = () => `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;

async function authCall(path, body) {
  const res = await fetch(`${authBase()}/${path}?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Auth emulator ${path} failed: ${JSON.stringify(json.error?.message)}`);
  return json;
}

/** What a browser does when someone creates an account with the public Firebase SDK (no role is granted). */
export const emulatorSignUp = (email, password) => authCall('accounts:signUp', { email, password });

/** Fresh ID token for an existing user (picks up custom claims set since the last sign-in). */
export const emulatorSignIn = async (email, password) => (await authCall('accounts:signInWithPassword', { email, password })).idToken;

/** Starts the real Express app (with the real admin router) on a random port. */
export async function startApi(ctx, adminConfig = {}, deviceConfig = {}, logger = createLogger(ctx.env), marketplaceConfig = {}) {
  const app = createApp({
    env: ctx.env,
    logger,
    auth: ctx.firebase.auth,
    repos: ctx.repos,
    adminConfig,
    deviceConfig,
    marketplaceConfig,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, headers = {}, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  return {
    base,
    call,
    close: () => new Promise((resolve) => server.close(resolve)),
    get: async (path, token, headers = {}) => {
      const { status, body } = await call('GET', path, { token, headers });
      return { status, body };
    },
  };
}
