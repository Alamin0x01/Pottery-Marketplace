import { generateDeviceSecret, hashDeviceSecret } from '../utils/deviceCredentials.js';
import { withConnectivity } from '../utils/connectivity.js';
import { potterSummary } from '../utils/serializers.js';

/**
 * Device management. This is the ONLY place a device secret exists in plain text: it is generated here, returned
 * once inside a `provisioning` object, and only its SHA-256 digest is handed to the repository. Nothing else
 * (logs, audit entries, later reads) ever sees it.
 */
export function createDevicesService({ repos, onlineWindowSec, clock = () => new Date() }) {
  const view = (device) => withConnectivity(device, { onlineWindowSec, now: clock() });

  const provisioning = (device, secret) => ({
    deviceId: device.id,
    secret,
    credentialVersion: device.credentialVersion,
    shownOnce: true,
  });

  async function withPotters(devices) {
    const potters = await repos.potters.getMany(devices.map((d) => d.potterId).filter(Boolean));
    const byId = new Map(potters.map((p) => [p.id, potterSummary(p)]));
    return devices.map((d) => ({ ...view(d), potter: d.potterId ? (byId.get(d.potterId) ?? null) : null }));
  }

  return {
    view,

    async register({ model, pollIntervalSec }, actor) {
      const secret = generateDeviceSecret();
      const input = { credentialHash: hashDeviceSecret(secret), model: model ?? null };
      if (pollIntervalSec !== undefined) input.pollIntervalSec = pollIntervalSec;
      const device = await repos.devices.register(input, { actor });
      return { device: view(device), provisioning: provisioning(device, secret) };
    },

    /** `status` accepts the display statuses: `active` = active and online, `offline` = active but silent. */
    async list({ status, q, limit, cursor }) {
      const connectivity = status === 'offline' ? 'offline' : status === 'active' ? 'online' : undefined;
      const stored = connectivity ? 'active' : status;
      const page = await repos.devices.list({ status: stored, connectivity, q, onlineWindowSec, now: clock(), limit, cursor });
      return { items: await withPotters(page.items), nextCursor: page.nextCursor };
    },

    async get(id) {
      const device = await repos.devices.getOrThrow(id);
      const [decorated] = await withPotters([device]);
      return decorated;
    },

    async assign({ deviceId, potterId }, actor) {
      return (await withPotters([await repos.devices.assign({ deviceId, potterId, actor })]))[0];
    },

    async setStatus(id, { status, reason }, actor) {
      return (await withPotters([await repos.devices.setStatus({ deviceId: id, status, reason, actor })]))[0];
    },

    async revoke(id, { reason }, actor) {
      return (await withPotters([await repos.devices.revokeCredentials({ deviceId: id, reason, actor })]))[0];
    },

    /** Issues a brand-new secret (the previous one stops working at once) and returns it exactly once. */
    async issueCredentials(id, actor) {
      const secret = generateDeviceSecret();
      const device = await repos.devices.rotateCredential({ deviceId: id, credentialHash: hashDeviceSecret(secret), actor });
      return { device: (await withPotters([device]))[0], provisioning: provisioning(device, secret) };
    },

    /** Communication history (heartbeats and refused requests), newest first. */
    async events(id, { limit, cursor }) {
      await repos.devices.getOrThrow(id);
      return repos.devices.listEvents(id, { limit, cursor });
    },

    /** Administrative history (who registered/assigned/disabled/revoked), newest first, with admin names. */
    async auditTrail(id, { limit, cursor }) {
      await repos.devices.getOrThrow(id);
      const page = await repos.auditLogs.listForTarget('devices', id, { limit, cursor });
      const admins = await repos.admins.getMany(page.items.filter((i) => i.actor.type === 'admin').map((i) => i.actor.id));
      const names = new Map(admins.map((a) => [a.id, a.name]));
      return {
        items: page.items.map((i) => ({
          id: i.id,
          timestamp: i.timestamp,
          action: i.action,
          actor: { type: i.actor.type, id: i.actor.id, name: names.get(i.actor.id) ?? null },
          before: i.before,
          after: i.after,
        })),
        nextCursor: page.nextCursor,
      };
    },
  };
}
