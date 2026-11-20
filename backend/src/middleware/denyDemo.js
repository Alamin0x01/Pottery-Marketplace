import { ApiError } from '../utils/ApiError.js';

/** Refuses destructive admin actions for the fixed judge-demo accounts (`demo` claim). Real admins are unaffected. */
export function denyDemo(req, _res, next) {
  if (req.user?.demo) {
    return next(new ApiError(403, 'DEMO_RESTRICTED', 'This is a DEMO account: this action is disabled. Everything can still be viewed.'));
  }
  next();
}
