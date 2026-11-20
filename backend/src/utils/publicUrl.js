// Demo products use static images bundled with the web app (web/public/images/products/). Their image `path` in
// Firestore is a site-relative URL such as `/images/products/clay-vase.jpg`, returned to clients unchanged.
const STATIC_IMAGE_PATH = /^\/images\/products\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/i;

export const isStaticImagePath = (path) => typeof path === 'string' && STATIC_IMAGE_PATH.test(path);

/**
 * Maps a stored image `path` to a URL clients can load. Private paths (e.g. `uploads/…/original.jpg`) always map to null.
 *  - static demo images (`/images/products/<file>`): returned as-is, served by the web app. No cloud storage involved.
 *  - Storage objects under `public/products/` (only when a bucket is configured; not used on the Spark plan):
 *      emulator: http://<storage-emulator-host>/v0/b/<bucket>/o/<path>?alt=media
 *      real project: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media (honours the Storage rules)
 */
export function createPublicImageUrl({ bucket, emulatorHost } = {}) {
  const base = emulatorHost ? `http://${emulatorHost}` : 'https://firebasestorage.googleapis.com';
  return (path) => {
    if (isStaticImagePath(path)) return path;
    return bucket && typeof path === 'string' && path.startsWith('public/products/') && !path.includes('..')
      ? `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
      : null;
  };
}
