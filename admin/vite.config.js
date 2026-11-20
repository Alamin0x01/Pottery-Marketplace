import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Demo product images live once, in web/public/images/products/ (see docs/FIREBASE_SETUP.md, "Product images").
// The admin app serves (dev) and bundles (build) that same folder so thumbnails resolve at /images/products/<file>.
const PRODUCT_IMAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/public/images/products');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };

function sharedProductImages() {
  return {
    name: 'shared-product-images',
    configureServer(server) {
      server.middlewares.use('/images/products', (req, res, next) => {
        const file = path.join(PRODUCT_IMAGES_DIR, path.basename(decodeURIComponent((req.url ?? '').split('?')[0])));
        const type = MIME[path.extname(file).toLowerCase()];
        if (!type || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', type);
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      if (!fs.existsSync(PRODUCT_IMAGES_DIR)) {
        this.warn(`Product images folder not found (${PRODUCT_IMAGES_DIR}). On Vercel, enable "Include source files outside of the Root Directory"; admin thumbnails will be blank otherwise.`);
        return;
      }
      for (const name of fs.readdirSync(PRODUCT_IMAGES_DIR)) {
        if (MIME[path.extname(name).toLowerCase()]) {
          this.emitFile({ type: 'asset', fileName: `images/products/${name}`, source: fs.readFileSync(path.join(PRODUCT_IMAGES_DIR, name)) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sharedProductImages()],
  server: { port: 5174, strictPort: true },
});
