import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Device credentials.
 *
 * A device secret is 32 random bytes from the OS CSPRNG, base64url-encoded (43 characters, 256 bits of entropy).
 * Only its SHA-256 digest is ever stored. Because the secret is high-entropy random, a fast hash is the right
 * tool: a leaked digest cannot be brute-forced, and (unlike bcrypt) verifying costs almost nothing per device request.
 */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateDeviceSecret() {
  return randomBytes(32).toString('base64url');
}

export const hashDeviceSecret = (secret) => createHash('sha256').update(secret, 'utf8').digest('hex');

// Compared against when the device does not exist or has no credential, so that every failure takes the
// same time and unknown-ID / wrong-secret / revoked cannot be told apart.
const DUMMY_HASH = hashDeviceSecret('no-such-device-secret');

/** Constant-time check of a presented secret against a stored digest (`null` = no valid credential). Always performs a compare. */
export function verifyDeviceSecret(presented, storedHash) {
  const candidate = Buffer.from(hashDeviceSecret(typeof presented === 'string' ? presented : ''), 'hex');
  const expected = Buffer.from(storedHash ?? DUMMY_HASH, 'hex');
  const equal = candidate.length === expected.length && timingSafeEqual(candidate, expected);
  return storedHash != null && equal;
}

/** Non-sensitive short reference shown to admins to tell credential generations apart (first 8 hex chars of the digest). */
export const credentialFingerprint = (storedHash) => (storedHash ? storedHash.slice(0, 8) : null);
