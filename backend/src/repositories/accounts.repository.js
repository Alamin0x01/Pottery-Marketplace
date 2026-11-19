import { randomBytes } from 'node:crypto';
import { COLLECTIONS } from '../db/collections.js';
import { serialize, serverTimestamp } from '../db/timestamps.js';
import {
  customerSchema, adminSchema, customerProfilePatchSchema, addressInputSchema, addressPatchSchema, MAX_ADDRESSES,
} from '../db/schemas/accounts.js';
import { docId } from '../db/schemas/common.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';

const newAddressId = () => randomBytes(6).toString('hex'); // 12 chars [0-9a-f]

/** Exactly one default when any address exists; the preferred one (if given) wins. */
function withSingleDefault(addresses, preferredId = null) {
  if (addresses.length === 0) return addresses;
  const chosen = addresses.find((a) => a.id === preferredId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  return addresses.map((a) => ({ ...a, isDefault: a.id === chosen.id }));
}

/**
 * Optional customer accounts; the document ID is the Firebase Auth uid. Guests have no document.
 * Every method takes the uid of the VERIFIED caller, so a customer can only ever touch their own document.
 */
export function createCustomersRepository(db) {
  const col = db.collection(COLLECTIONS.customers);

  async function get(uid) {
    return docId.safeParse(uid).success ? serialize(await col.doc(uid).get()) : null;
  }

  /** Full-document write used by fixtures/scripts. Saved addresses are never overwritten on update. */
  async function upsert(uid, input) {
    const id = parseOrThrow(docId, uid);
    const { addresses, ...data } = parseOrThrow(customerSchema, input);
    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (snap.exists) tx.update(ref, { ...data, updatedAt: serverTimestamp() });
      else tx.create(ref, { ...data, addresses, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    return get(id);
  }

  /** Creates the profile on first call (name and phone required) or edits name/phone. `email` is the verified token email. */
  async function saveProfile(uid, patch, { email = null } = {}) {
    const id = parseOrThrow(docId, uid);
    const data = parseOrThrow(customerProfilePatchSchema, patch);
    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (snap.exists) {
        tx.update(ref, { ...data, ...(email ? { email } : {}), updatedAt: serverTimestamp() });
        return;
      }
      const missing = ['name', 'phone'].filter((k) => data[k] === undefined);
      if (missing.length) {
        throw ApiError.badRequest('Name and phone are required to create your profile', missing.map((path) => ({ path, message: 'required' })));
      }
      tx.create(ref, { ...data, email, address: null, addresses: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    return get(id);
  }

  async function mutateAddresses(uid, change) {
    const id = parseOrThrow(docId, uid);
    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw ApiError.conflict('Complete your profile before saving addresses', 'PROFILE_REQUIRED');
      const next = change(snap.data().addresses ?? []);
      tx.update(ref, { addresses: next, updatedAt: serverTimestamp() });
    });
    return (await get(id)).addresses;
  }

  const addAddress = (uid, input) => {
    const data = parseOrThrow(addressInputSchema, input);
    return mutateAddresses(uid, (list) => {
      if (list.length >= MAX_ADDRESSES) throw ApiError.conflict(`You can save up to ${MAX_ADDRESSES} addresses`, 'ADDRESS_LIMIT');
      const entry = { ...data, id: newAddressId(), isDefault: data.isDefault || list.length === 0 };
      return withSingleDefault([...list, entry], entry.isDefault ? entry.id : null);
    });
  };

  const updateAddress = (uid, addressId, input) => {
    const data = parseOrThrow(addressPatchSchema, input);
    return mutateAddresses(uid, (list) => {
      if (!list.some((a) => a.id === addressId)) throw ApiError.notFound('Address not found');
      const updated = list.map((a) => (a.id === addressId ? { ...a, ...data } : a));
      return withSingleDefault(updated, data.isDefault ? addressId : (updated.find((a) => a.isDefault)?.id ?? null));
    });
  };

  const removeAddress = (uid, addressId) =>
    mutateAddresses(uid, (list) => {
      if (!list.some((a) => a.id === addressId)) throw ApiError.notFound('Address not found');
      return withSingleDefault(list.filter((a) => a.id !== addressId));
    });

  return { get, upsert, saveProfile, addAddress, updateAddress, removeAddress };
}

/**
 * Admin directory (listing/auditing). The Firebase custom claim, not this document, is what authorises
 * requests; it is written by the create-admin script in Phase 3.
 */
export function createAdminsRepository(db) {
  const col = db.collection(COLLECTIONS.admins);

  async function get(uid) {
    return docId.safeParse(uid).success ? serialize(await col.doc(uid).get()) : null;
  }

  async function getMany(uids) {
    const unique = [...new Set(uids)].filter((u) => docId.safeParse(u).success);
    if (unique.length === 0) return [];
    const snaps = await db.getAll(...unique.map((u) => col.doc(u)));
    return snaps.map(serialize).filter(Boolean);
  }

  async function upsert(uid, input) {
    const id = parseOrThrow(docId, uid);
    const data = parseOrThrow(adminSchema, input);
    await db.runTransaction(async (tx) => {
      const ref = col.doc(id);
      const snap = await tx.get(ref);
      if (snap.exists) tx.update(ref, data);
      else tx.create(ref, { ...data, createdAt: serverTimestamp() });
    });
    return get(id);
  }

  async function setActive(uid, active) {
    const id = parseOrThrow(docId, uid);
    const ref = col.doc(id);
    if (!(await ref.get()).exists) return null;
    await ref.update({ active: active === true });
    return get(id);
  }

  function list({ limit, cursor } = {}) {
    return runShape(db, findShape(COLLECTIONS.admins, { equals: [] }), { limit, cursor });
  }

  /** Number of active superadmins, used to stop the last one from being removed. */
  async function countActiveSuperadmins() {
    const query = col.where('role', '==', 'superadmin').where('active', '==', true);
    return (await query.count().get()).data().count;
  }

  return { get, getMany, upsert, setActive, list, countActiveSuperadmins };
}
