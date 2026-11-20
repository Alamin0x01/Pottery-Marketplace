import { ApiError } from '../utils/ApiError.js';
import { ADMIN_ROLES } from '../db/enums.js';

// Firebase Admin SDK codes that mean "this token is not acceptable" (-> 401). Anything else (network
// trouble talking to Firebase Auth, internal errors) is NOT the caller's fault and becomes a 503, so an
// outage never looks like "your session is invalid".
const REJECTED_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/invalid-user-token',
  'auth/user-token-expired',
]);

const MAX_TOKEN_LENGTH = 4096;

/**
 * Verifies the Firebase ID token in `Authorization: Bearer <token>` with the Admin SDK (signature, expiry,
 * audience, and — with `checkRevoked` — revocation and disabled accounts) and sets `req.user`.
 *
 * The role comes ONLY from the verified token's custom claim, which only the backend can write.
 * Nothing in the request body, query or other headers is ever consulted for identity or role.
 */
export function authenticateUser({ auth, logger, checkRevoked = true }) {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization') ?? '';
      const [scheme, token, ...extra] = header.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0 || token.length > MAX_TOKEN_LENGTH) {
        throw ApiError.unauthorized();
      }

      let decoded;
      try {
        decoded = await auth.verifyIdToken(token, checkRevoked);
      } catch (err) {
        if (REJECTED_TOKEN_CODES.has(err?.code)) throw ApiError.unauthorized('Invalid or expired session');
        logger?.error({ err: { code: err?.code, name: err?.name } }, 'token verification unavailable');
        throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication service unavailable, please retry');
      }

      req.user = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        role: ADMIN_ROLES.includes(decoded.role) ? decoded.role : null,
        // Marks the fixed judge-demo accounts (custom claim written only by the demo seed script).
        demo: decoded.demo === true,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * For endpoints that work for guests and signed-in customers. No `Authorization` header = guest. A header that is
 * present must be valid: a bad or expired token is a 401, never silently treated as a guest (which would e.g.
 * place an order that the signed-in customer then cannot find in their history).
 */
export function optionalUser(options) {
  const verify = authenticateUser(options);
  return (req, res, next) => (req.get('authorization') ? verify(req, res, next) : next());
}
