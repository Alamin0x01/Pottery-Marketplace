# Judge demo accounts

Fixed **DEMO** accounts for the judging demonstration, in the real Firebase project (Spark plan, no Cloud Storage). This file contains **no passwords**: they live in the git-ignored `backend/.env.demo`, and the shareable sheet is generated into the git-ignored `judge-credentials/JUDGE_CREDENTIALS.md`.

## Roles in the code (none added or removed)
| Role | How it is defined | Where it signs in |
|------|-------------------|-------------------|
| `superadmin` | Firebase custom claim `role` | Admin dashboard (:5174). Everything, including `GET /api/admin/admins` |
| `admin` | Firebase custom claim `role` | Admin dashboard. Everything except the admin list (403) |
| customer | Any signed-in user without a role claim, plus a `customers/{uid}` document | Storefront (:5173). Own profile, addresses and orders only; the admin API answers 403 |
| potter | **Not a login role.** A record managed by admins; its ESP32 device uses a device ID + secret | none |

| Demo account | Email | Name |
|--------------|-------|------|
| Superadmin | `superadmin@mati.demo` | DEMO Superadmin |
| Admin | `admin@mati.demo` | DEMO Admin |
| Customer | `customer@mati.demo` | DEMO Customer |
| Potter record | (no login) | DEMO Potter, with four "DEMO ..." products using the static demo images |

Every demo user carries the custom claim `demo: true`. The backend reads it from the verified token only.

## Safety
* **Destructive actions are blocked for demo admins** (`DEMO_RESTRICTED`, 403): potter activate/deactivate, device enable/disable, device revoke and issuing device credentials. They can view everything. See `backend/src/middleware/denyDemo.js`.
* **Real users are never overwritten.** If an email already exists without the `demo` claim, the seed skips it untouched.
* **Idempotent.** Re-running creates nothing twice and does not change passwords (unless `--reset-passwords`, and only for accounts that carry the `demo` claim).
* Passwords are generated locally into `backend/.env.demo`, never printed, never committed. The "Demo login" panel in the apps only fills the **email**; Firebase Authentication and the backend still check the password. It shows only in the **development server** (`npm run dev`) when `VITE_DEMO_MODE=true` is set in a local `.env.local`; production builds (`vite build`, i.e. Vercel) compile it out entirely, so the demo emails are not in the public bundle. Never set it on Vercel.

## Commands (from `backend/`)
```powershell
$run = 'node --env-file-if-exists=.env --env-file-if-exists=.env.demo scripts/seed-demo-accounts.js'
node scripts/seed-demo-accounts.js init                 # once: creates .env.demo with generated passwords
Invoke-Expression "$run seed --yes"                     # creates/updates accounts + DEMO potter/products (--yes for a real project)
Invoke-Expression "$run doc"                            # writes judge-credentials/JUDGE_CREDENTIALS.md
Invoke-Expression "$run verify"                         # signs in as every demo account and checks role-based access (backend must be running)
```
`seed` can be rehearsed against clean emulators first: `node scripts/emulators.js exec "<command>"` with `--env-file=.env.emulator-backup` before the other env files.
