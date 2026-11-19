import rateLimit from 'express-rate-limit';

const message = { error: { code: 'RATE_LIMITED', message: 'Too many requests' } };

/**
 * Throttles clients that keep failing authentication/authorization (4xx responses) on admin routes.
 * Successful requests are not counted, so legitimate admins are never locked out by it.
 */
export const adminFailureLimiter = ({ limit = 30, windowMs = 10 * 60_000 } = {}) =>
  rateLimit({ windowMs, limit, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message });

/** Per-device request limit (keyed by the authenticated device id, because cellular devices share NAT addresses). */
export const deviceLimiter = ({ limit = 60, windowMs = 60_000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.device?.deviceId ?? 'anonymous',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
  });

/** Per-signed-in-customer request limit (keyed by the verified uid). */
export const userLimiter = ({ limit = 300, windowMs = 60_000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.user?.uid ?? 'anonymous',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
  });

/** Order placement: per IP (before anything else runs). */
export const orderIpLimiter = ({ limit = 15, windowMs = 10 * 60_000 } = {}) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message });

/** Order placement: per buyer phone (after validation, so it sees the normalised number). */
export const orderPhoneLimiter = ({ limit = 10, windowMs = 10 * 60_000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `phone:${req.valid?.body?.buyerPhone ?? 'none'}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
  });

/** Per-admin request limit (keyed by the verified uid, so shared office IPs do not interfere). */
export const adminLimiter = ({ limit = 600, windowMs = 60_000 } = {}) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.user?.uid ?? 'anonymous',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message,
  });
