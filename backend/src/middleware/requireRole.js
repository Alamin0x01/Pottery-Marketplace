import { ApiError } from '../utils/ApiError.js';

/** Allows the request only if `req.user.role` (set by authenticateUser from the token claim) is listed. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden('Admin access required'));
    next();
  };
}
