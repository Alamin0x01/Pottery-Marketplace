import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', CORS_ORIGINS: 'http://localhost:5173' });
  const app = createApp({ env, logger: createLogger(env) });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /health returns ok with security headers and request id', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
  assert.ok(res.headers.get('x-request-id'));
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('unknown route returns the standard error shape', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.ok(body.error.requestId);
});

test('malformed JSON returns 400, not 500', async () => {
  const res = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{bad',
  });
  assert.equal(res.status, 400);
});

test('CORS: allow-listed origin passes, unknown origin is rejected', async () => {
  const ok = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const bad = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
});

test('invalid environment fails fast', () => {
  assert.throws(() => loadEnv({ PORT: 'abc' }), /Invalid environment configuration/);
});

test('readiness reports unavailable when Firebase is not configured', async () => {
  const res = await fetch(`${base}/health/ready`);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).reason, 'firebase_not_configured');
});

test('readiness reflects the probe result and never leaks error details', async () => {
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const probe = (result) => async () => result;
  const serve = async (readiness) => {
    const app = createApp({ env, logger: createLogger(env), readiness });
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/health/ready`);
    const body = await res.json();
    await new Promise((resolve) => srv.close(resolve));
    return { status: res.status, body };
  };

  const ok = await serve(probe({ ok: true, checks: { firestore: { ok: true, ms: 3 } } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'ready');

  const down = await serve(probe({ ok: false, checks: { firestore: { ok: false, ms: 9, error: 'UNAVAILABLE (network or emulator unreachable)' } } }));
  assert.equal(down.status, 503);
  assert.equal(down.body.status, 'unavailable');
});

test('logger redacts credentials, tracking tokens and personal data', () => {
  const lines = [];
  const logger = createLogger(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'info' }), { write: (l) => lines.push(l) });
  logger.info(
    {
      req: { headers: { authorization: 'Bearer abc', 'x-device-secret': 'dev-secret', 'x-tracking-token': 'track-me', 'x-ok': 'visible' } },
      order: { buyerPhone: '01712345678', deliveryAddress: 'House 1', secret: 's3cret' },
    },
    'request',
  );
  const out = lines.join('');
  for (const leaked of ['Bearer abc', 'dev-secret', 'track-me', '01712345678', 'House 1', 's3cret']) {
    assert.ok(!out.includes(leaked), `${leaked} leaked into logs`);
  }
  assert.ok(out.includes('visible'));
});
