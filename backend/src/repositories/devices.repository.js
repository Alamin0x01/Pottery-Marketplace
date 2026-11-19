import { z } from 'zod';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, COUNTER_NAMES } from '../db/collections.js';
import { serialize, serverTimestamp, timestampAfter } from '../db/timestamps.js';
import { TERMINAL_ORDER_STATUS, DEVICE_STATUS } from '../db/enums.js';
import { deviceRegisterSchema, deviceTelemetrySchema, deviceStatusSchema, statusReasonSchema } from '../db/schemas/devices.js';
import { actor as actorSchema, deviceId as deviceIdSchema, potterId as potterIdSchema, sha256Hex } from '../db/schemas/common.js';
import { formatDeviceId, ID_PATTERNS } from '../utils/ids.js';
import { credentialFingerprint } from '../utils/deviceCredentials.js';
import { connectivityOf, DEFAULT_ONLINE_WINDOW_SEC } from '../utils/connectivity.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';
import { findShape } from '../db/queryShapes.js';
import { runShape } from './query.js';
import { COUNTER_TX_ATTEMPTS } from './counters.repository.js';

const EVENT_RETENTION_MS = 30 * 24 * 3600 * 1000;
const SEARCH_CAP = 50;

/**
 * The credential hash must never leave the repository except through `getForAuth`. Admin-facing views get
 * only whether a credential exists, a short non-reversible fingerprint to tell generations apart, and the version.
 */
const toSafe = (device) => {
  if (!device) return device;
  const { credentialHash, ...rest } = device;
  return {
    ...rest,
    model: rest.model ?? null,
    credentialRevokedAt: rest.credentialRevokedAt ?? null,
    hasCredential: Boolean(credentialHash),
    credentialFingerprint: credentialFingerprint(credentialHash),
  };
};

/**
 * Chooses which of a potter's devices should receive a notification: active devices only, most
 * recently seen first (never-seen last), ties broken by earliest assignment then id.
 * Works on serialized devices (ISO-8601 strings sort chronologically).
 */
export function pickDeliveryDevice(devices) {
  const active = devices.filter((d) => d.status === 'active');
  const time = (v, fallback) => v ?? fallback;
  active.sort(
    (a, b) =>
      time(b.lastSeen, '').localeCompare(time(a.lastSeen, '')) ||
      time(a.assignedAt, '9').localeCompare(time(b.assignedAt, '9')) ||
      a.id.localeCompare(b.id),
  );
  return active[0] ?? null;
}

export function createDevicesRepository(db, { counters, auditLogs }) {
  const col = db.collection(COLLECTIONS.devices);
  const pottersCol = db.collection(COLLECTIONS.potters);
  const notificationsCol = db.collection(COLLECTIONS.notifications);
  const ordersCol = db.collection(COLLECTIONS.orders);
  const eventsCol = db.collection(COLLECTIONS.deviceEvents);

  const validId = (id) => ID_PATTERNS.device.test(id);

  async function getForAuth(id) {
    if (!validId(id)) return null;
    return serialize(await col.doc(id).get());
  }
  async function get(id) {
    return toSafe(await getForAuth(id));
  }
  async function getOrThrow(id) {
    const device = await get(id);
    if (!device) throw ApiError.notFound('Device not found');
    return device;
  }

  /**
   * Registers an unassigned device with the next DEV-### id. The caller supplies only the credential hash
   * (the secret itself never reaches the repository). With an `actor`, the audit entry commits in the same transaction.
   */
  async function register(input, { actor } = {}) {
    const data = parseOrThrow(deviceRegisterSchema, input);
    const by = actor ? parseOrThrow(actorSchema, actor) : null;
    try {
      const id = await db.runTransaction(
        async (tx) => {
          const counter = await counters.peek(tx, COUNTER_NAMES.device, 1);
          const deviceId = formatDeviceId(counter.value);
          counters.commit(tx, counter);
          tx.create(col.doc(deviceId), {
            potterId: null,
            credentialHash: data.credentialHash,
            credentialVersion: 1,
            credentialRevokedAt: null,
            model: data.model,
            status: 'unassigned',
            pollIntervalSec: data.pollIntervalSec,
            lastSeen: null,
            firmwareVersion: null,
            batteryPct: null,
            signalCsq: null,
            queuedUploads: null,
            droppedUploads: null,
            registeredAt: serverTimestamp(),
            assignedAt: null,
            updatedAt: serverTimestamp(),
          });
          if (by) {
            auditLogs.write(tx, {
              actor: by,
              action: 'device.register',
              target: { collection: COLLECTIONS.devices, id: deviceId },
              after: { status: 'unassigned', model: data.model, credentialVersion: 1 },
            });
          }
          return deviceId;
        },
        { maxAttempts: COUNTER_TX_ATTEMPTS },
      );
      return await getOrThrow(id);
    } catch (err) {
      // Firestore code 6 = ALREADY_EXISTS: the counter is behind existing data. Never overwrite a device.
      if (err?.code === 6) throw ApiError.conflict('Device ID already exists (sequence counter out of sync)', 'ID_COLLISION');
      throw err;
    }
  }

  /**
   * Reads (inside a transaction) the notifications still pending on a device that is leaving its
   * potter, and decides where each goes: another active device of the same potter, or expiry plus an
   * admin-attention flag on the order. Must run before any write in the transaction.
   */
  async function planRelease(tx, deviceId, ownerPotterId) {
    if (!ownerPotterId) return [];
    const pending = await tx.get(
      notificationsCol.where('deviceId', '==', deviceId).where('status', 'in', ['pending', 'delivered']),
    );
    if (pending.empty) return [];
    const orderRefs = pending.docs.map((d) => ordersCol.doc(d.data().orderId));
    const orders = await tx.getAll(...orderRefs);
    const others = await tx.get(col.where('potterId', '==', ownerPotterId).where('status', '==', 'active'));
    const target = pickDeliveryDevice(others.docs.filter((d) => d.id !== deviceId).map(serialize));
    return pending.docs.map((doc, i) => ({ ref: doc.ref, orderRef: orderRefs[i], order: orders[i], target: target?.id ?? null }));
  }

  function applyRelease(tx, plan) {
    for (const { ref, orderRef, order, target } of plan) {
      const open = order.exists && !TERMINAL_ORDER_STATUS.includes(order.data().status);
      if (target && open) {
        tx.update(ref, { deviceId: target });
      } else {
        tx.update(ref, { status: 'expired' });
        if (open) {
          tx.update(orderRef, {
            needsAdminAttention: true,
            attentionReason: 'no_active_device',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  }

  /** Assigns (or reassigns) a device to an active potter. Ownership, audit entry and notification re-targeting commit together. */
  async function assign({ deviceId, potterId, actor }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const pId = parseOrThrow(potterIdSchema, potterId);
    const by = parseOrThrow(actorSchema, actor);

    await db.runTransaction(async (tx) => {
      const deviceRef = col.doc(dId);
      const [deviceSnap, potterSnap] = await tx.getAll(deviceRef, pottersCol.doc(pId));
      if (!deviceSnap.exists) throw ApiError.notFound('Device not found');
      if (!potterSnap.exists) throw ApiError.notFound('Potter not found');
      if (potterSnap.data().status !== 'active') throw ApiError.conflict('Potter is not active');

      const device = deviceSnap.data();
      if (device.status === 'disabled' || device.status === 'lost') {
        throw ApiError.conflict('Device is disabled or lost; re-enable it before assigning', 'DEVICE_NOT_ASSIGNABLE');
      }
      if (!device.credentialHash) {
        throw ApiError.conflict('Device has no valid credential; issue new credentials before assigning', 'NO_CREDENTIAL');
      }
      if (device.potterId === pId && device.status === 'active') return; // already assigned: idempotent

      const reassigning = Boolean(device.potterId) && device.potterId !== pId;
      applyRelease(tx, reassigning ? await planRelease(tx, dId, device.potterId) : []);

      tx.update(deviceRef, { potterId: pId, status: 'active', assignedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      auditLogs.write(tx, {
        actor: by,
        action: reassigning ? 'device.reassign' : 'device.assign',
        target: { collection: COLLECTIONS.devices, id: dId },
        before: { potterId: device.potterId, status: device.status },
        after: { potterId: pId, status: 'active' },
      });
    });
    return getOrThrow(dId);
  }

  /**
   * Enables, disables or marks a device lost. Leaving `active` re-targets its pending notifications.
   * `lost` also revokes the credential in the same transaction, so a stolen device stops authenticating at once.
   * Enabling requires an owner, an active owner potter and a valid credential.
   */
  async function setStatus({ deviceId, status, actor, reason }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const next = parseOrThrow(deviceStatusSchema, status);
    const by = parseOrThrow(actorSchema, actor);
    const why = reason === undefined ? null : parseOrThrow(statusReasonSchema, reason);

    await db.runTransaction(async (tx) => {
      const deviceRef = col.doc(dId);
      const deviceSnap = await tx.get(deviceRef);
      if (!deviceSnap.exists) throw ApiError.notFound('Device not found');
      const device = deviceSnap.data();
      if (device.status === next) return;

      if (next === 'active') {
        if (!device.potterId) throw ApiError.conflict('Device has no owner; assign it to a potter first', 'NO_OWNER');
        if (!device.credentialHash) {
          throw ApiError.conflict('Device has no valid credential; issue new credentials first', 'NO_CREDENTIAL');
        }
        const potterSnap = await tx.get(pottersCol.doc(device.potterId));
        if (!potterSnap.exists || potterSnap.data().status !== 'active') {
          throw ApiError.conflict('Owner potter is not active', 'POTTER_INACTIVE');
        }
      }
      const leavingActive = device.status === 'active' && next !== 'active';
      applyRelease(tx, leavingActive ? await planRelease(tx, dId, device.potterId) : []);

      const update = { status: next, updatedAt: serverTimestamp() };
      const revoking = next === 'lost' && Boolean(device.credentialHash);
      if (revoking) {
        update.credentialHash = null;
        update.credentialVersion = device.credentialVersion + 1;
        update.credentialRevokedAt = serverTimestamp();
      }
      tx.update(deviceRef, update);
      auditLogs.write(tx, {
        actor: by,
        action: next === 'active' ? 'device.enable' : next === 'lost' ? 'device.mark_lost' : 'device.disable',
        target: { collection: COLLECTIONS.devices, id: dId },
        before: { status: device.status },
        after: { status: next, ...(revoking ? { credentialRevoked: true } : {}), ...(why ? { reason: why } : {}) },
      });
    });
    return getOrThrow(dId);
  }

  /**
   * Revokes the credential immediately: the stored hash is deleted, so no secret can ever match again.
   * An active device is also disabled (and its pending notifications re-targeted); `lost`/`unassigned` keep their status.
   * Idempotent: revoking an already revoked device changes nothing.
   */
  async function revokeCredentials({ deviceId, actor, reason }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const by = parseOrThrow(actorSchema, actor);
    const why = reason === undefined ? null : parseOrThrow(statusReasonSchema, reason);

    await db.runTransaction(async (tx) => {
      const deviceRef = col.doc(dId);
      const snap = await tx.get(deviceRef);
      if (!snap.exists) throw ApiError.notFound('Device not found');
      const device = snap.data();
      if (!device.credentialHash) return;

      const disable = device.status === 'active';
      applyRelease(tx, disable ? await planRelease(tx, dId, device.potterId) : []);
      const version = device.credentialVersion + 1;
      tx.update(deviceRef, {
        credentialHash: null,
        credentialVersion: version,
        credentialRevokedAt: serverTimestamp(),
        ...(disable ? { status: 'disabled' } : {}),
        updatedAt: serverTimestamp(),
      });
      auditLogs.write(tx, {
        actor: by,
        action: 'device.revoke_credential',
        target: { collection: COLLECTIONS.devices, id: dId },
        before: { status: device.status, credentialVersion: device.credentialVersion },
        after: { status: disable ? 'disabled' : device.status, credentialVersion: version, ...(why ? { reason: why } : {}) },
      });
    });
    return getOrThrow(dId);
  }

  /**
   * Stores a new credential hash; any previous secret stops working immediately. The hash is never audited.
   * Refused while the device is `lost` (move it to `disabled` first, which is a deliberate recovery decision).
   * The status is left unchanged: a revoked-then-disabled device must still be enabled explicitly.
   */
  async function rotateCredential({ deviceId, credentialHash, actor }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const hash = parseOrThrow(sha256Hex, credentialHash);
    const by = parseOrThrow(actorSchema, actor);

    await db.runTransaction(async (tx) => {
      const deviceRef = col.doc(dId);
      const snap = await tx.get(deviceRef);
      if (!snap.exists) throw ApiError.notFound('Device not found');
      const device = snap.data();
      if (device.status === 'lost') {
        throw ApiError.conflict('A lost device cannot receive credentials; set it to disabled first', 'DEVICE_LOST');
      }
      const version = device.credentialVersion + 1;
      tx.update(deviceRef, {
        credentialHash: hash,
        credentialVersion: version,
        credentialRevokedAt: null,
        updatedAt: serverTimestamp(),
      });
      auditLogs.write(tx, {
        actor: by,
        action: 'device.rotate_secret',
        target: { collection: COLLECTIONS.devices, id: dId },
        before: { credentialVersion: device.credentialVersion },
        after: { credentialVersion: version },
      });
    });
    return getOrThrow(dId);
  }

  /** Records a poll/heartbeat: `lastSeen` plus the telemetry fields a device is allowed to write. No history entry. */
  async function recordSeen(deviceId, telemetry = {}) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const data = parseOrThrow(deviceTelemetrySchema, telemetry);
    try {
      await col.doc(dId).update({ ...data, lastSeen: serverTimestamp(), updatedAt: serverTimestamp() });
    } catch (err) {
      if (err?.code === 5) throw ApiError.notFound('Device not found');
      throw err;
    }
  }

  /**
   * An authenticated heartbeat: updates `lastSeen`/telemetry and appends a communication-history event in one
   * atomic batch. `potterId` comes from the authenticated device record, never from the request. Events expire
   * after 30 days (Firestore TTL on `expireAt`).
   */
  async function recordHeartbeat({ deviceId, potterId, telemetry = {} }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const data = parseOrThrow(deviceTelemetrySchema, telemetry);
    const batch = db.batch();
    batch.update(col.doc(dId), { ...data, lastSeen: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.create(eventsCol.doc(), {
      deviceId: dId,
      potterId: potterId ?? null,
      type: 'heartbeat',
      ...data,
      at: serverTimestamp(),
      expireAt: timestampAfter(EVENT_RETENTION_MS),
    });
    try {
      await batch.commit();
    } catch (err) {
      if (err?.code === 5) throw ApiError.notFound('Device not found');
      throw err;
    }
  }

  /** History entry for a request that presented a VALID secret but was refused (disabled device, inactive potter). */
  async function recordRejected({ deviceId, potterId, reason }) {
    await eventsCol.doc().create({
      deviceId: parseOrThrow(deviceIdSchema, deviceId),
      potterId: potterId ?? null,
      type: 'rejected',
      reason: parseOrThrow(statusReasonSchema, reason),
      at: serverTimestamp(),
      expireAt: timestampAfter(EVENT_RETENTION_MS),
    });
  }

  /** Newest-first communication history of one device. */
  async function listEvents(deviceId, { limit, cursor } = {}) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    return runShape(db, findShape(COLLECTIONS.deviceEvents, { equals: ['deviceId'] }), {
      filters: { deviceId: dId },
      limit,
      cursor,
    });
  }

  /**
   * Lists devices. `connectivity` ('online' | 'offline') applies to active devices and is derived from `lastSeen`
   * against the online window: online = `lastSeen >= now - window` (range query); offline = oldest-contact-first
   * (never-seen devices sort first) up to the first device that is online. `q` is a Device ID prefix search;
   * status/connectivity are then applied in memory to that small result.
   */
  async function list({ status, connectivity, q, onlineWindowSec = DEFAULT_ONLINE_WINDOW_SEC, now = new Date(), limit, cursor } = {}) {
    const wantedStatus = status === undefined ? undefined : parseOrThrow(z.enum(DEVICE_STATUS), status);
    if (connectivity !== undefined && !['online', 'offline'].includes(connectivity)) {
      throw ApiError.badRequest('connectivity must be online or offline');
    }
    if (connectivity && wantedStatus && wantedStatus !== 'active') {
      throw ApiError.badRequest('connectivity can only be combined with the active status');
    }
    const thresholdMs = now.getTime() - onlineWindowSec * 1000;

    if (q) {
      const digits = q.trim().toUpperCase();
      const prefix = /^\d+$/.test(digits) ? `DEV-${digits}` : digits;
      const { docs } = await col
        .where(FieldPath.documentId(), '>=', prefix)
        .where(FieldPath.documentId(), '<', `${prefix}\uf8ff`)
        .limit(SEARCH_CAP)
        .get();
      const items = docs
        .map(serialize)
        .filter((d) => wantedStatus === undefined || d.status === (connectivity ? 'active' : wantedStatus))
        .filter((d) => !connectivity || (connectivity === 'online') === (connectivityOf(d, { onlineWindowSec, now }) === 'online'))
        .map(toSafe);
      return { items, nextCursor: null };
    }

    if (connectivity) {
      const online = connectivity === 'online';
      const shape = findShape(COLLECTIONS.devices, { equals: ['status'], sort: online ? 'seen_desc' : 'seen_asc' });
      const page = await runShape(db, shape, {
        filters: { status: 'active' },
        range: online ? { field: 'lastSeen', min: Timestamp.fromMillis(thresholdMs) } : null,
        limit,
        cursor,
      });
      if (online) return { items: page.items.map(toSafe), nextCursor: page.nextCursor };
      const offline = [];
      for (const device of page.items) {
        if (device.lastSeen && new Date(device.lastSeen).getTime() >= thresholdMs) {
          return { items: offline.map(toSafe), nextCursor: null };
        }
        offline.push(device);
      }
      return { items: offline.map(toSafe), nextCursor: page.nextCursor };
    }

    const equals = wantedStatus === undefined ? [] : ['status'];
    const filters = wantedStatus === undefined ? {} : { status: wantedStatus };
    return runShape(db, findShape(COLLECTIONS.devices, { equals }), { filters, limit, cursor, map: toSafe });
  }

  /** A potter's devices (small set; sorted in memory so no extra index is needed). */
  async function listByPotter(potterId, { status } = {}) {
    const pId = parseOrThrow(potterIdSchema, potterId);
    let query = col.where('potterId', '==', pId);
    if (status) query = query.where('status', '==', status);
    const { docs } = await query.get();
    return docs.map(serialize).map(toSafe).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  }

  return {
    get,
    getOrThrow,
    getForAuth,
    register,
    assign,
    setStatus,
    revokeCredentials,
    rotateCredential,
    recordSeen,
    recordHeartbeat,
    recordRejected,
    listEvents,
    list,
    listByPotter,
  };
}
