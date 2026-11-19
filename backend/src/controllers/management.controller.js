import { BD_DISTRICTS } from '../utils/districts.js';
import { DEVICE_FILTER_STATUS } from '../validators/admin.validators.js';

const actorOf = (req) => ({ type: 'admin', id: req.user.uid });

/** Responses that carry a device secret must never be cached by browsers or proxies. */
const noStore = (res) => res.set('Cache-Control', 'no-store');

/** HTTP layer for potter and device management. The acting admin always comes from the verified token. */
export function createManagementController({ services, onlineWindowSec }) {
  const { potters, devices } = services;
  return {
    meta: (_req, res) =>
      res.json({ districts: BD_DISTRICTS, deviceStatuses: DEVICE_FILTER_STATUS, onlineWindowSec }),

    async createPotter(req, res) {
      res.status(201).json({ potter: await potters.register(req.valid.body, actorOf(req)) });
    },
    async listPotters(req, res) {
      res.json(await potters.list(req.valid.query));
    },
    async getPotter(req, res) {
      res.json(await potters.profile(req.valid.params.id));
    },
    async updatePotter(req, res) {
      res.json({ potter: await potters.update(req.valid.params.id, req.valid.body, actorOf(req)) });
    },
    async setPotterStatus(req, res) {
      res.json({ potter: await potters.setStatus(req.valid.params.id, req.valid.body.status, actorOf(req)) });
    },

    async registerDevice(req, res) {
      noStore(res);
      res.status(201).json(await devices.register(req.valid.body, actorOf(req)));
    },
    async listDevices(req, res) {
      res.json(await devices.list(req.valid.query));
    },
    async getDevice(req, res) {
      res.json({ device: await devices.get(req.valid.params.id) });
    },
    async assignDevice(req, res) {
      res.json({ device: await devices.assign(req.valid.body, actorOf(req)) });
    },
    async setDeviceStatus(req, res) {
      res.json({ device: await devices.setStatus(req.valid.params.id, req.valid.body, actorOf(req)) });
    },
    async revokeDevice(req, res) {
      res.json({ device: await devices.revoke(req.valid.params.id, req.valid.body, actorOf(req)) });
    },
    async issueCredentials(req, res) {
      noStore(res);
      res.status(201).json(await devices.issueCredentials(req.valid.params.id, actorOf(req)));
    },
    async deviceEvents(req, res) {
      res.json(await devices.events(req.valid.params.id, req.valid.query));
    },
    async deviceAudit(req, res) {
      res.json(await devices.auditTrail(req.valid.params.id, req.valid.query));
    },
  };
}
