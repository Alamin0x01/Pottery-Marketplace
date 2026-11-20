# Deployment: everything on Vercel (three projects)

Firebase stays on the **Spark (free) plan** with **Authentication and Firestore only**. Cloud Storage is not used: demo product images are static files in `web/public/images/products/`.

| Vercel project | Root directory | What | Config |
|----------------|----------------|------|--------|
| `mati-api` | `backend` | Express API as a Serverless Function | `backend/vercel.json`, `backend/api/index.js` |
| `mati-marketplace` | `web` | Customer site (Vite) | `web/vercel.json` |
| `mati-admin` | `admin` | Admin dashboard (Vite) | `admin/vercel.json` |

All three come from the same GitHub repo (`main`). Node: API `24.x`, web/admin `22.x` (`engines`). If a project name is taken, Vercel assigns a different URL: always use the URLs Vercel reports.

**Current production URLs:** API `https://mati-api-zeta.vercel.app`, customer site `https://mati-marketplace.vercel.app`, admin `https://mati-admin-mu.vercel.app`.

**Deployed with the Vercel CLI**, because the Vercel GitHub app could not see this repo, so Git auto-deploys are not connected yet. To connect them: GitHub > Settings > Applications > Vercel > add the repository, then in each project > Settings > Git, with Root Directories `backend`, `web`, `admin`. Manual redeploy: `vercel deploy --prod` from `backend/`, `web/` or `admin/` (each has an ignored `.vercel/project.json` link). A CLI deploy of `admin/` uploads only that folder, so copy the shared images to `admin/public/images/products` for that deploy and remove them afterwards (Git-based deploys read them from `../web`).

## 1. How the API runs on Vercel
* `backend/api/index.js` exports the Express app as the function handler (`src/vercel.js`). The app is created lazily once per warm instance (Firebase Admin initialises on the first request and is then reused). `src/bootstrap.js` is shared with the local server (`src/server.js`), so both run the same app.
* `backend/vercel.json` rewrites `/(.*)` to `/api`, so every existing URL (`/health`, `/health/ready`, `/api/...`) is unchanged. Region `bom1` (Mumbai) is next to Firestore `asia-south1`. `npm ci --omit=dev` skips the large dev-only `firebase-tools`.
* **Node 24 + `jose` override.** `firebase-admin` pulls `jwks-rsa`, which `require()`s the ESM-only `jose` 6; Vercel's function loader rejects that (`ERR_REQUIRE_ESM`). `backend/package.json` therefore overrides `jwks-rsa`'s `jose` to `^5.10.0` (CommonJS-compatible; the few functions `jwks-rsa` uses exist in both). Re-check this if `firebase-admin` is upgraded.
* Invalid configuration returns `503 SERVICE_UNAVAILABLE` (details in the function logs, never in the response) and the next request retries.

### Limitations on Vercel (and what to do)
1. **Rate limits and the device-secret failure throttle are in memory.** Each function instance keeps its own counters, which also reset on a cold start, so limits are approximate under heavy concurrency. Fine for a demo. For strict limits use a shared store (Upstash Redis via `rate-limit-redis`) or Vercel Firewall rules.
2. **Cold starts** add roughly 1-2 s to the first request after idle. ESP32 firmware should use an HTTP timeout of at least 10 s.
3. **ESP32 polling:** the only device endpoint is `POST /api/device/heartbeat` (10 KB body). It works on Vercel over **HTTPS only** (HTTP is redirected); the device must trust the certificate chain of the Vercel domain. Throughput is bounded by Firestore's Spark quota (50k reads / 20k writes per day), not by Vercel.
4. **Image upload is not implemented yet.** Vercel request bodies are limited to 4.5 MB and the filesystem is read-only. Without Firebase Storage, the chosen direction is small JPEGs (up to about 700 KB, base64) in Firestore documents; decide and build when the device-upload phase starts.
5. Hobby plan is for non-commercial use (fine for the judging demo).

## 2. Order of deployment
1. Create and deploy **`mati-api`**, then read its real URL from Vercel.
2. Deploy **`mati-marketplace`** and **`mati-admin`** with `VITE_API_URL=<mati-api URL>/api`.
3. Set `CORS_ORIGINS` on `mati-api` to the two real web and admin origins and redeploy it.
4. Firebase authorized domains and API-key restriction (section 5).

## 3. Environment variables
**`mati-api`** (never in `web` / `admin`; never committed):

| Variable | Value | Secret? |
|----------|-------|---------|
| `NODE_ENV` | `production` (emulator variables are refused in production) | no |
| `FIREBASE_PROJECT_ID` | `shilposetu` | no |
| `FIREBASE_SERVICE_ACCOUNT_B64` | base64 of the service-account JSON | **YES** |
| `CORS_ORIGINS` | `https://<web>.vercel.app,https://<admin>.vercel.app` (exact origins, no trailing slash or path) | no |
| `TRUST_PROXY_HOPS` | `1` (Vercel adds one proxy hop; otherwise rate limits see the proxy IP) | no |

Leave **unset**: `FIREBASE_STORAGE_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS` (no file on Vercel), all `*_EMULATOR_HOST`. Optional: `LOG_LEVEL`, `DEVICE_ONLINE_WINDOW_SEC`.

Pipe the key into Vercel without printing it (run inside `backend/` after `vercel link`):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('<path to your service-account key>.json')) | vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production
```

**`mati-marketplace`** and **`mati-admin`** (public values only):

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://<mati-api URL>/api` |
| `VITE_FIREBASE_API_KEY` | web API key from the Firebase console (public by design) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `shilposetu.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `shilposetu` |
| `VITE_FIREBASE_APP_ID` | `1:454625455808:web:4ea4691a67bfd6262ec725` |

**Never set** `VITE_USE_FIREBASE_EMULATORS` (a production build refuses it) or `VITE_DEMO_MODE`. Never put a secret in a `VITE_*` variable: the apps refuse to start if they find one.

* `vercel.json` in `web` and `admin` rewrites every route to `index.html` (React Router) and adds security headers. Static files, including `/images/products/*.jpg`, are served before the rewrite.
* The admin build copies the product images from `../web/public/images/products` (`admin/vite.config.js`). In the **admin** project keep **"Include source files outside of the Root Directory in the Build Step"** enabled (default), or admin thumbnails are blank (the build prints a warning).
* **Demo login is development-only**: it is compiled out of production builds (`import.meta.env.DEV`), so the demo emails are not in the bundle even if `VITE_DEMO_MODE` is set by mistake. Demo passwords are never in any bundle.

## 4. Verify
`GET <mati-api>/health/ready` returns `{"status":"ready", ... "storage":{"skipped":true}}`; `/api/products` returns 200; `/api/admin/me` returns 401 without a token; a request with an `Origin` that is not in `CORS_ORIGINS` returns 403. Then smoke test both sites (shop with images, product page, cart, checkout, customer login, admin login, refresh on `/shop` without a 404).

## 5. After the first deploy
1. Firebase console → Authentication → Settings → **Authorized domains**: add the web and admin Vercel domains.
2. Google Cloud console → APIs & Services → Credentials → the browser API key: restrict by **HTTP referrers** to those two domains (plus `localhost:*` for development).
3. Seed the judge demo accounts against the live project (see [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md)) and run `verify --api https://<mati-api URL>`. Share `judge-credentials/JUDGE_CREDENTIALS.md` with judges privately; it is never committed.

## 6. Security checklist
- [x] Firestore rules deny all direct access; every read/write goes through the backend (Admin SDK).
- [x] Admin routes verify the Firebase ID token, require the `role` custom claim, and are rate-limited; demo admins cannot run destructive actions.
- [x] CORS allow-list of exact origins; devices and curl send no Origin header.
- [x] The service-account key exists only as a Vercel secret and on your machine.
- [ ] API key referrer restriction and authorized domains (section 5).
- [ ] `VITE_DEMO_MODE` and `VITE_USE_FIREBASE_EMULATORS` absent from Vercel.
