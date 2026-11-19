import { createCountersRepository } from './counters.repository.js';
import { createAuditLogsRepository } from './auditLogs.repository.js';
import { createProductsRepository } from './products.repository.js';
import { createPottersRepository } from './potters.repository.js';
import { createDevicesRepository } from './devices.repository.js';
import { createUploadsRepository } from './uploads.repository.js';
import { createOrdersRepository } from './orders.repository.js';
import { createNotificationsRepository } from './notifications.repository.js';
import { createCustomersRepository, createAdminsRepository } from './accounts.repository.js';
import { createStatsRepository } from './stats.repository.js';

/** The only place that wires repositories together. `db` is a firebase-admin Firestore instance. */
export function createRepositories(db) {
  const counters = createCountersRepository(db);
  const auditLogs = createAuditLogsRepository(db);
  const products = createProductsRepository(db, { auditLogs });
  const potters = createPottersRepository(db, { counters, auditLogs, products });
  const devices = createDevicesRepository(db, { counters, auditLogs });
  const uploads = createUploadsRepository(db, { products });
  const orders = createOrdersRepository(db);
  const notifications = createNotificationsRepository(db);
  const customers = createCustomersRepository(db);
  const admins = createAdminsRepository(db);
  const stats = createStatsRepository(db);
  return { counters, auditLogs, products, potters, devices, uploads, orders, notifications, customers, admins, stats };
}
