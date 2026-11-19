import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

// Stable error shape: { error: { code, message, details?, requestId } }. No stack traces leave the server.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details;

  if (err instanceof ApiError) {
    ({ status, code, message, details } = err);
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Malformed JSON body';
  } else if (err?.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    status = 403;
    code = 'CORS_ORIGIN_NOT_ALLOWED';
    message = 'Origin not allowed';
  }

  if (status >= 500) req.log?.error({ err }, 'unhandled error');
  if (err?.retryAfterSec) res.set('Retry-After', String(err.retryAfterSec));

  res.status(status).json({ error: { code, message, details, requestId: req.id } });
}
