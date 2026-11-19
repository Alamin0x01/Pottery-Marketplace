import { COLLECTIONS } from '../db/collections.js';
import { serverTimestamp } from '../db/timestamps.js';
import { deviceId as deviceIdSchema, docId } from '../db/schemas/common.js';
import { draftImagesSchema } from '../db/schemas/products.js';
import { uploadMetaSchema } from '../db/schemas/system.js';
import { uploadDocId } from '../utils/ids.js';
import { ApiError } from '../utils/ApiError.js';
import { parseOrThrow } from '../utils/validate.js';

export function createUploadsRepository(db, { products }) {
  const col = db.collection(COLLECTIONS.uploads);
  const devicesCol = db.collection(COLLECTIONS.devices);
  const pottersCol = db.collection(COLLECTIONS.potters);
  const productsCol = db.collection(COLLECTIONS.products);

  /**
   * Records a device capture and its draft product atomically, idempotently per (deviceId, captureId).
   * Call this only AFTER the image is safely stored (see API_DESIGN §3).
   *
   * There is deliberately no `potterId` parameter: the owner is read from the device's stored record,
   * so a device can never choose which potter a product belongs to.
   * Returns `{ duplicate, productId }`; a duplicate returns the original product and writes nothing.
   */
  async function createWithDraft({ deviceId, productId, images, ...meta }) {
    const dId = parseOrThrow(deviceIdSchema, deviceId);
    const pId = parseOrThrow(docId, productId);
    const imgs = parseOrThrow(draftImagesSchema, images);
    const { captureId, sizeBytes, sha256 } = parseOrThrow(uploadMetaSchema, meta);

    return db.runTransaction(async (tx) => {
      const uploadRef = col.doc(uploadDocId(dId, captureId));
      const [uploadSnap, deviceSnap] = await tx.getAll(uploadRef, devicesCol.doc(dId));
      if (uploadSnap.exists) return { duplicate: true, productId: uploadSnap.data().productId };

      if (!deviceSnap.exists) throw ApiError.notFound('Device not found');
      const device = deviceSnap.data();
      if (device.status !== 'active' || !device.potterId) throw ApiError.forbidden('Device is not active');

      const potterSnap = await tx.get(pottersCol.doc(device.potterId));
      if (!potterSnap.exists || potterSnap.data().status !== 'active') throw ApiError.forbidden('Potter is not active');

      tx.create(
        productsCol.doc(pId),
        products.buildDraft({ potterId: device.potterId, potter: potterSnap.data(), deviceId: dId, images: imgs }),
      );
      tx.create(uploadRef, {
        deviceId: dId,
        potterId: device.potterId,
        captureId,
        productId: pId,
        sizeBytes,
        sha256,
        createdAt: serverTimestamp(),
      });
      return { duplicate: false, productId: pId };
    });
  }

  return { createWithDraft };
}
