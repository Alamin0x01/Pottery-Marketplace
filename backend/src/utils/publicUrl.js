/**
 * Builds public image URLs for objects under `public/products/` (the only Storage path the rules make publicly
 * readable). Private paths such as `uploads/…/original.jpg` always map to null.
 *  - emulator: http://<storage-emulator-host>/v0/b/<bucket>/o/<path>?alt=media
 *  - real project: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media (honours the Storage rules)
 */
export function createPublicImageUrl({ bucket, emulatorHost }) {
  const base = emulatorHost ? `http://${emulatorHost}` : 'https://firebasestorage.googleapis.com';
  return (path) =>
    typeof path === 'string' && path.startsWith('public/products/') && !path.includes('..')
      ? `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
      : null;
}
