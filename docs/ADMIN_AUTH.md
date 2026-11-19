# Admin Authentication and Access Control (Phase 3)

How administrators sign in, how they are created, and how access is enforced. Related: [FIREBASE_SETUP.md](FIREBASE_SETUP.md) · [API_DESIGN.md](API_DESIGN.md) · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) §6.

## 1. How it works

```
Admin browser ──(1) email+password──▶ Firebase Authentication  ──▶ ID token (JWT, ~1 h, auto-refreshed)
Admin browser ──(2) Authorization: Bearer <ID token> ──▶ Express backend
                                       │ verifyIdToken(token, checkRevoked=true)   signature, expiry, audience, revocation, disabled user
                                       │ role = token custom claim "role"          set ONLY by the backend (Admin SDK)
                                       └ requireRole("admin"|"superadmin")  →  handler
```

* **Identity** = a Firebase user. **Authorization** = the custom claim `role` (`admin` or `superadmin`) inside the *verified* token. Being signed in to Firebase proves who you are, not that you are an admin.
* The role is **never** taken from a request body, query string or header. Tests send `X-Role: superadmin`, `?role=superadmin` and forged unsigned tokens: all are refused.
* Claims can only be written with the Admin SDK (service-account credentials). Browsers cannot change them.
* There is **no sign-up page** in the admin app and **no API that grants a role**. Anyone can technically create a Firebase account if sign-up is enabled in your Firebase project, but such an account has no role and every `/api/admin/*` call answers `403`.
* `checkRevoked` makes the backend reject tokens of removed/disabled admins on the very next request (one extra Firebase Auth call per admin request; acceptable at admin scale).
* A role removal also calls `revokeRefreshTokens`, so the browser cannot silently obtain new tokens.

### Status codes
| Code | Meaning | Admin UI behaviour |
|------|---------|--------------------|
| `401 UNAUTHORIZED` | Missing/invalid/expired/revoked token or disabled user | Refreshes the token once; if still rejected: signs out → login page "Your session has expired" |
| `403 FORBIDDEN` | Valid user without an admin role (or `admin` on a superadmin route) | On login: signs out → "This account does not have administrator access" |
| `429 RATE_LIMITED` | Too many failed attempts from one client (30 / 10 min), or 600 req/min per admin | Error panel with retry |
| `503 AUTH_UNAVAILABLE` | Backend cannot reach Firebase Auth (an outage is **not** reported as "invalid session") | "Cannot verify" screen with retry |

## 2. Create the first admin securely

The only way to grant admin access is the **admin management script**, run by an operator who holds the Firebase Admin credentials (the same ones in `backend/.env`).

### Prerequisites
* `backend/.env` points at your Firebase project (see FIREBASE_SETUP.md §9) — or at the emulators for local testing.
* Email/Password sign-in is enabled (FIREBASE_SETUP.md §5).

### Steps (Windows PowerShell shown; the `node` form works in every shell)
```powershell
cd backend

# A) Person has no Firebase account yet (typical for the first admin): --create
node --env-file=.env scripts/manage-admin.js grant --email you@example.com --name "Your Name" --role superadmin --create --yes
```
* Prints the project, makes the user, sets the claim, records the admin, writes an audit entry and prints a **one-time password-reset link**. Open that link to choose your own password. The random initial password is never shown or stored anywhere.
* **Treat the link like a password** (do not paste it into chat/issues/commits).
* `--yes` is required when the configured project is a real one (not the emulators) so a mistake cannot silently change production access.

```powershell
# B) The person already signed up (e.g. created in the Firebase console): omit --create
node --env-file=.env scripts/manage-admin.js grant --email colleague@example.com --name "Colleague" --role admin --yes
```

Then open the admin app, sign in, and check **Settings** (name, role, user ID).

### Day-to-day
```powershell
node --env-file=.env scripts/manage-admin.js list
node --env-file=.env scripts/manage-admin.js revoke --email colleague@example.com --yes
```
* `revoke` removes the role, **revokes all sessions** and marks the directory entry inactive. It refuses to remove the **last active superadmin**.
* Existing sessions pick up a *new* role at their next token refresh (up to ~1 hour) — sign out and in to apply immediately.
* Firebase tracks revocation with **one-second granularity**: a token minted in the same second as the revocation still verifies. Real sessions are older, so this is irrelevant in practice.
* Passwords are **never accepted on the command line** (`--password` is refused).
* PowerShell note: `npm run admin -- grant …` loses the `--` separator in PowerShell; use the `node` form above, or `npm run admin '--' grant …`.

### Superadmin vs admin
`superadmin` can additionally see the administrators directory (Settings → Administrators). Both roles can use the dashboard. Granting/revoking is only ever done by the script.

## 3. Hardening checklist (do before production)
- [ ] **Multi-factor authentication for admins.** Not implemented in Phase 3: Firebase MFA requires upgrading to Identity Platform and enabling it in the console **[VERIFY]**, plus enrolment UI. Until then use strong unique passwords, or sign-in with Google on accounts that enforce 2-step verification. Tracked in ARCHITECTURE_AUDIT (U3).
- [ ] Optionally disable public sign-up in the Firebase project (Authentication → Settings → User actions, available with Identity Platform **[VERIFY]**). Even when enabled, sign-ups have no role.
- [ ] Keep the number of admins small; review `list` regularly; revoke leavers immediately.
- [ ] Restrict the Firebase web API key to your admin domain(s).
- [ ] Serve the admin app over HTTPS on its own domain; add that origin to the backend `CORS_ORIGINS`.

## 4. What is tested
| Area | Test | Needs real Firebase? |
|------|------|----------------------|
| Missing/malformed/forged token → 401 | `backend/tests/emulator/admin.test.js`, `unit/adminAuth.test.js` | No (emulator) |
| Signed-in non-admin → 403 everywhere; role spoofing ignored | same | No |
| Role from claim only; old token has no claim until refresh | same | No |
| Superadmin-only route | same | No |
| Revocation ends sessions; disabled users rejected; last-superadmin guard | same | No |
| 401 vs 503 (infrastructure failure is not "invalid session") | `unit/adminAuth.test.js` | No |
| Failed-auth throttling | `admin.test.js` | No |
| Dashboard/activity/orders/products/search against Firestore | `admin.test.js` | No |
| Login, invalid login, non-admin login, protected routes, persistence, mid-session revocation, logout, responsive layout | Manual browser run against the emulators (steps in §5) | No |
| `generatePasswordResetLink` delivering a link a human can use; Email/Password provider config; real token signing keys; MFA | — | **Yes** |

## 5. Manual end-to-end check (emulators)
```powershell
# terminal 1
cd backend; npm run emulators
# terminal 2  (backend/.env in emulator mode)
cd backend
node scripts/seed-demo.js                        # optional demo data (emulator-only; refuses real projects)
node --env-file=.env scripts/manage-admin.js grant --email owner@example.com --name "Site Owner" --role superadmin --create
#   -> open the printed link in the browser (it targets the Auth emulator) and set a password,
#      or create the user first through the emulator and omit --create.
npm run dev
# terminal 3
cd admin; npm run dev                            # http://localhost:5174
```
Check: `/` redirects to `/login`; wrong password → "Invalid email or password"; a user without a role → "does not have administrator access"; admin → dashboard with real numbers; reload keeps you signed in; Logout returns to login; revoking the admin while signed in forces a sign-out on the next request.

## 6. Troubleshooting
| Symptom | Cause / fix |
|---------|-------------|
| **Login shows "Cannot reach the Firebase Auth emulator…"** (older builds: "Network error. Check your connection…") | The browser's sign-in request to the emulator was refused: the emulators are not running. Start them: `cd backend; npm run emulators`. If that stops with a Java message, install Java 21+ (`winget install EclipseAdoptium.Temurin.21.JDK`, then a new terminal). The login page shows an amber warning while the emulator is unreachable and clears it automatically when it starts. **Confirm in DevTools → Network:** the failing call is `POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/…signInWithPassword` with `ERR_CONNECTION_REFUSED`; no request reaches port 4000. |
| "Network error. Check your internet connection…" (real project) | The browser cannot reach Firebase: check the connection, a firewall/proxy, or ad-blockers blocking `googleapis.com` |
| Admin app shows "The admin app is not configured" | `admin/.env.local` lacks `VITE_FIREBASE_*` (copy `.env.example`) |
| Login works but "does not have administrator access" | No role claim yet: run `grant`; sign out and in |
| Role granted but still 403 | Old token: sign out/in (or wait for refresh) |
| Dashboard says "Cannot reach the server" | Backend not running, wrong `VITE_API_URL`, or admin origin missing from `CORS_ORIGINS` |
| 503 "Authentication service unavailable" | Backend cannot reach Firebase Auth (network/credentials) — check `npm run check:firebase` |
| `grant` says "Re-run with --yes" | Real project safety check |
| `npm run admin -- …` ignores flags in PowerShell | Use `node --env-file=.env scripts/manage-admin.js …` |
