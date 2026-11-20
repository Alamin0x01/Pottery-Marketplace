import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { createApp } from '../../src/app.js';
import { createServerlessHandler } from '../../src/vercel.js';

const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', CORS_ORIGINS: 'https://web.example.app', TRUST_PROXY_HOPS: '1' });
const buildApp = () => ({ app: createApp({ env, logger: createLogger(env), readiness: async () => ({ ok: true, checks: {} }) }) });

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('serverless handler serves the Express app at its original paths and builds it only once', async () => {
  let builds = 0;
  const handler = createServerlessHandler(() => {
    builds += 1;
    return buildApp();
  });
  await withServer(handler, async (base) => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal(builds, 1);
  });
});

test('serverless handler keeps the CORS allow-list', async () => {
  await withServer(createServerlessHandler(buildApp), async (base) => {
    const ok = await fetch(`${base}/health`, { headers: { origin: 'https://web.example.app' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://web.example.app');
    assert.equal((await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })).status, 403);
  });
});

test('invalid configuration gives a 503 without crashing, and the next request retries', async () => {
  let attempts = 0;
  const handler = createServerlessHandler(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('Firebase configuration error: No Firebase credentials');
    return buildApp();
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    await withServer(handler, async (base) => {
      const failed = await fetch(`${base}/health`);
      assert.equal(failed.status, 503);
      const body = await failed.json();
      assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
      assert.ok(!JSON.stringify(body).includes('credentials'), 'internal details are not leaked');
      assert.equal((await fetch(`${base}/health`)).status, 200);
    });
  } finally {
    console.error = quiet;
  }
});
