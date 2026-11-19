import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ADMIN_ROLES } from '../db/enums.js';
import { COLLECTIONS } from '../db/collections.js';
import { text } from '../db/schemas/common.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';

const email = z.email().max(254).transform((e) => e.toLowerCase());
const grantSchema = z.strictObject({
  email,
  name: text(2, 100),
  role: z.enum(ADMIN_ROLES),
  createIfMissing: z.boolean().default(false),
});
const revokeSchema = z.strictObject({ email });

const SYSTEM_ACTOR = { type: 'system', id: 'admin-cli' };

async function findUser(auth, address) {
  try {
    return await auth.getUserByEmail(address);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

/**
 * The trusted process that creates admins. It is only reachable by whoever holds the Firebase Admin
 * credentials (the operator running scripts/manage-admin.js) — there is no public endpoint that can
 * grant a role, and the role is stored as a Firebase custom claim that clients cannot modify.
 */
export function createAdminsService({ auth, repos }) {
  async function grant(input) {
    const data = parseOrThrow(grantSchema, input);

    let user = await findUser(auth, data.email);
    let created = false;
    if (!user) {
      if (!data.createIfMissing) {
        throw ApiError.notFound('No Firebase user has that email. Create the user first, or use the create option.');
      }
      // A random password nobody ever sees; the person sets their own through the reset link below.
      user = await auth.createUser({ email: data.email, displayName: data.name, password: randomBytes(24).toString('base64url') });
      created = true;
    }

    const previousRole = user.customClaims?.role ?? null;
    await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: data.role });
    await repos.admins.upsert(user.uid, { name: data.name, email: data.email, role: data.role, active: true });
    await repos.auditLogs.append({
      actor: SYSTEM_ACTOR,
      action: 'admin.grant',
      target: { collection: COLLECTIONS.admins, id: user.uid },
      before: { role: previousRole },
      after: { role: data.role },
    });

    // Existing sessions pick the new claim up on their next token refresh (up to an hour).
    const passwordResetLink = created ? await auth.generatePasswordResetLink(data.email) : null;
    return { uid: user.uid, email: data.email, name: data.name, role: data.role, created, passwordResetLink };
  }

  async function revoke(input) {
    const { email: address } = parseOrThrow(revokeSchema, input);
    const user = await findUser(auth, address);
    if (!user) throw ApiError.notFound('No Firebase user has that email');

    const currentRole = user.customClaims?.role ?? null;
    if (currentRole === 'superadmin' && (await repos.admins.countActiveSuperadmins()) <= 1) {
      throw ApiError.conflict('Refusing to remove the last active superadmin');
    }

    const { role: _removed, ...otherClaims } = user.customClaims ?? {};
    await auth.setCustomUserClaims(user.uid, otherClaims);
    // Invalidates every session immediately (tokens are verified with checkRevoked).
    await auth.revokeRefreshTokens(user.uid);
    await repos.admins.setActive(user.uid, false);
    await repos.auditLogs.append({
      actor: SYSTEM_ACTOR,
      action: 'admin.revoke',
      target: { collection: COLLECTIONS.admins, id: user.uid },
      before: { role: currentRole },
      after: { role: null },
    });
    return { uid: user.uid, email: address, previousRole: currentRole };
  }

  return { grant, revoke };
}
