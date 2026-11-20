import { createRuntime } from './bootstrap.js';

/**
 * Vercel serverless adapter. The Express app is a plain `(req, res)` function, so it can be the function handler
 * itself. It is built lazily ONCE per warm instance (Firebase Admin initialises on the first request, then is reused);
 * if the configuration is invalid the request gets a 503 and the next request retries instead of the function crashing.
 * `build` is injectable for tests.
 */
export function createServerlessHandler(build = createRuntime) {
  let runtime = null;
  return function handler(req, res) {
    if (!runtime) {
      try {
        runtime = build();
      } catch (err) {
        // Messages from config validation never contain credential values.
        console.error(JSON.stringify({ level: 'fatal', msg: 'backend failed to initialise', error: err?.message }));
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is not available right now' } }));
        return undefined;
      }
    }
    return runtime.app(req, res);
  };
}
