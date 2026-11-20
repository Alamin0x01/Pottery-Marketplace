# Deployment: Railway (backend) + Vercel (web and admin)

Firebase stays on the **Spark (free) plan** with **Authentication and Firestore only**. Cloud Storage is not used: demo product images are static files in `web/public/images/products/`.

| App | Host | Root directory | Config |
|-----|------|----------------|--------|
| Backend (Express) | Railway | `backend` | `backend/railway.json`, Node 22 (`engines`, `.node-version`) |
| Customer site | Vercel project 1 | `web` | `web/vercel.json` |
| Admin dashboard | Vercel project 2 | `admin` | `admin/vercel.json` |

## 1. Before deploying
* Commit and push to GitHub (`main`). `.env*`, `judge-credentials/`, key files and `emulator-data/` are git-ignored; never commit them. The images in `web/public/images/products/` **must** be committed or the shop shows "Photo coming soon".
* Production build checks: `cd web; npm test; npm run build` and `cd admin; npm test; npm run build` and `cd backend; npm test`.
* Firestore rules (deny-all) and indexes are already deployed to `shilposetu` (`firebase deploy --only firestore:rules,firestore:indexes --project shilposetu`). Do **not** deploy Storage rules.

## 2. Railway: backend
New project → *Deploy from GitHub repo* → set **Root Directory = `backend`**. `railway.json` sets the start command (`npm start`) and the health check (`/health`). Generate a public domain (Settings → Networking); use it as `<railway-url>` below.

| Variable | Value | Secret? |
|----------|-------|---------|
| `NODE_ENV` | `production` (also skips dev dependencies; emulator variables are refused in production) | no |
| `FIREBASE_PROJECT_ID` | `shilposetu` | no |
| `FIREBASE_SERVICE_ACCOUNT_B64` | base64 of the service-account JSON (below) | **YES** |
| `CORS_ORIGINS` | `https://<web>.vercel.app,https://<admin>.vercel.app` (exact origins, no trailing slash or path) | no |
| `TRUST_PROXY_HOPS` | `1` (Railway sits behind one proxy; otherwise rate limits see the proxy IP) | no |
| `PORT` | set by Railway | no |

Leave **unset**: `FIREBASE_STORAGE_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS` (a file path does not exist on Railway), all `*_EMULATOR_HOST`. Optional: `LOG_LEVEL`, `DEVICE_ONLINE_WINDOW_SEC`.

Copy the key to the clipboard **without printing it**, then paste it into Railway's variable editor and clear the clipboard:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('<path to your service-account key>.json')) | Set-Clipboard
```
Check: `https://<railway-url>/health/ready` returns `{"status":"ready", ... "storage":{"skipped":true}}`.

## 3. Vercel: web and admin (two projects, same repo)
Import the repo twice. Framework Vite (auto), **Root Directory `web`** and **`admin`**, Node 22. Set these **public** variables in **both** projects:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<railway-url>/api` |
| `VITE_FIREBASE_API_KEY` | web API key from the Firebase console (public by design) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `shilposetu.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `shilposetu` |
| `VITE_FIREBASE_APP_ID` | `1:454625455808:web:4ea4691a67bfd6262ec725` |

**Never set** `VITE_USE_FIREBASE_EMULATORS` (a production build refuses it) or `VITE_DEMO_MODE`. Never put a service account or any secret in a `VITE_*` variable: the apps refuse to start if they find one.

* `vercel.json` rewrites every route to `index.html` (React Router) and adds security headers. Static files, including `/images/products/*.jpg`, are served before the rewrite.
* The admin build copies the product images from `../web/public/images/products` (`admin/vite.config.js`). In the **admin** Vercel project keep **"Include source files outside of the Root Directory in the Build Step"** enabled (default), or admin thumbnails are blank (the build prints a warning).
* **Demo login is development-only.** `DemoLogin` is compiled out of production builds (`import.meta.env.DEV`), so the demo emails are not in the bundle even if `VITE_DEMO_MODE` is set by mistake. Demo passwords are never in any bundle.

## 4. After the first deploy
1. Add the two Vercel domains to **`CORS_ORIGINS`** on Railway (redeploy).
2. Firebase console → Authentication → Settings → **Authorized domains**: add `<web>.vercel.app` and `<admin>.vercel.app` (currently only `localhost`, `shilposetu.firebaseapp.com`, `shilposetu.web.app`).
3. Google Cloud console → APIs & Services → Credentials → the browser API key: restrict by **HTTP referrers** to those two domains (plus `localhost:*` for development) and to the Identity Toolkit / Token Service APIs.
4. Seed the judge demo accounts against the live project (see [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md)) and run `verify --api https://<railway-url>`. Share `judge-credentials/JUDGE_CREDENTIALS.md` with judges privately; it is never committed.
5. Smoke test: shop loads with images, product page, cart, checkout, customer login, admin login, `/shop` refresh (no 404).

## 5. Security checklist
- [x] Firestore rules deny all direct access; every read/write goes through the backend (Admin SDK).
- [x] Admin routes verify the Firebase ID token, require the `role` custom claim, and are rate-limited; demo admins cannot run destructive actions.
- [x] CORS allow-list of exact origins; devices and curl send no Origin header.
- [x] The service-account key exists only as a Railway secret and on your machine.
- [ ] API key referrer restriction and authorized domains (step 4).
- [ ] `VITE_DEMO_MODE` and `VITE_USE_FIREBASE_EMULATORS` absent from Vercel.
