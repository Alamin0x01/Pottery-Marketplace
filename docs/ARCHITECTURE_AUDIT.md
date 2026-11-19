# Architecture Audit

Scope: the five design documents and the Phase 1 scaffold, compared against `docs/cloudcamp.pdf` (all 16 pages). No application code was modified, no dependencies installed, Phase 2 not started. Documentation inconsistencies found were fixed in place (§2); what could not be fixed by documentation is in §3; the exact list of open warnings is the register in §4.

Legend: **PASS** = satisfied by the design · **WARNING** = acceptable but with a stated risk/follow-up · **FAIL** = requirement not met. *Statuses describe the design; nothing below is implemented or tested yet beyond the Phase 1 scaffold.*

## 1. Summary

| # | Check | Status | Notes |
|---|-------|:------:|-------|
| 1 | Collections and relationships consistent across documents | **PASS** | Fixed 6 drifts (see §2). 8 required + 5 supporting collections now match in analysis, DB, API and roadmap |
| 2 | Potter-to-device relationship | **PASS** | Single source of truth `devices.potterId`; PDF's `potters.deviceIds` deliberately dropped (documented) |
| 3 | One potter, multiple devices | **PASS** | `devices.potterId` index; notification goes to first active device; stranded notifications re-targeted on disable/reassign (added in audit) |
| 4 | Device sees only its potter's data | **PASS** | Potter derived from DB record after credential check; no endpoint accepts a potter ID; foreign ack → 404. Needs isolation tests in Phases 4/9 |
| 5 | Device authentication secure | **WARNING** | Design is sound (server-generated random 256-bit secret, `SHA-256` hash — pepper removed in the follow-up review, constant-time compare incl. unknown-ID path, 401/403 ordering, immediate per-device revocation, bounded blast radius). Still **unproven on hardware**: certificate verification by the A7670E TLS stack (now a fail-closed gate, spike H0), ESP32 flash encryption, secret provisioning handling. See W1 |
| 6 | Firebase Auth ↔ backend authorization | **PASS** | ID token verified server-side, role via custom claim set only by backend scripts, `checkRevoked` on all admin routes, `revokeRefreshTokens` on admin deactivation; invalid optional token → 401 (not ignored) |
| 7 | Customer/admin separation | **PASS** | Separate apps/bundles; RBAC (`admin`/`superadmin`) matrix; customers have no claim; guests use tracking token; all admin routes behind role check |
| 8 | Image upload secure and reliable | **PASS** | Size + JPEG start/end markers + decode, per-device quota, raw body (no multer), **Storage-first then transaction** (audit fix), idempotent via `X-Capture-Id`, private originals |
| 9 | Gemini processing asynchronous | **PASS** | Upload returns 202; worker with lease/backoff; state in Firestore; failure still reviewable by admin |
| 10 | Failed uploads / retries | **PASS** | Device queue + exponential backoff + jitter; idempotent re-send; 401/403 keep image (audit fix); 400/413/415 discard; AI retries ≤3 |
| 11 | Duplicate orders / notifications prevented | **PASS** | Was **FAIL** before audit (uniqueness on a field is not enforceable in Firestore). Now deterministic `idempotency_keys` doc + recent-duplicate guard; notification ID `{orderId}_{type}` |
| 12 | Acknowledgment ≠ acceptance | **PASS** | `delivered` → `seller_notified`; `acknowledged` = seen only; acceptance is admin-recorded `contacted → price_negotiation → confirmed`; system transition never regresses a later admin status |
| 13 | Order history maintained | **PASS** | Append-only, same transaction as each change, includes creation row and system/device transitions, actor recorded |
| 14 | All endpoints documented | **PASS** | All PDF §9 endpoints present verbatim; ➕ additions: `/api/me`, `/api/me/orders`, categories, featured potters, admin notifications queue, blocked phones, audit logs, device status/rotate, product edit/reject/delete, reports, dashboard |
| 15 | Environment variables / secrets | **WARNING** | Design OK (env-only, validated at boot, no secrets in `VITE_*`, least-privilege service account, emulators for dev). Open and **not fixable in documentation**: the scaffold logger doesn't yet redact `x-tracking-token` or buyer PII; the folder is not a git repository, so `.gitignore` is untested and no secret scanner exists yet. See W2 |
| 16 | Suitable for hundreds/thousands of potters | **WARNING** | Indexed queries, cursor pagination, `count()` aggregates, async AI: fine. Limits: reports per potter/district (needs `stats` aggregates, Phase 10), in-memory rate limiter (single instance only), `lastSeen` write cost (~US$15/month per 1,000 devices at 5-min polling **[VERIFY]**), single-token search, and — most important — **admin phone follow-up is a human bottleneck** (R1) |
| 17 | Missing PDF requirements | **PASS** (with documented deviations) | No PDF requirement is unaddressed. Deviations, all intentional: customer Firebase Auth is optional (guest checkout, owner-approved); `potters.deviceIds` dropped; `notifications.message` generated at read time (no PII at rest); `products.imageUrl` plus `images[]`; PDF phases 8/9 split slightly differently (auth middleware Phase 4, upload Phase 6) |
| — | Folder structure duplication | **WARNING** | Doc-level duplication removed (see §3). Remaining duplication is intentional: `web/` and `admin/` each keep their own `api/client.js`, `ApiStatus`, theme tokens (avoids monorepo tooling); `/health` mounted at `/health` and `/api/health` on purpose |

**Totals: 0 FAIL · 14 PASS · 4 WARNING (checks 5, 15, 16 and the folder-structure note).** Before the audit fixes, checks 8 and 11 were FAIL and checks 3, 10 and 14 were WARNING-level; all were fixed in the documents.

## 2. Defects found and fixed in the documents

| ID | Defect (before) | Severity | Fix |
|----|-----------------|:--:|-----|
| A1 | Order idempotency "unique per customer/phone" but Firestore cannot enforce field uniqueness ⇒ concurrent duplicate orders possible | High | `idempotency_keys/{sha256(phone:key)}` created inside the order transaction; plus 10-minute same-phone/product guard |
| A2 | Replayed idempotent order returned no tracking token ⇒ buyer whose response was lost could never track | High | Token re-issued (old one invalidated) on replay; fragment-based tracking link |
| A3 | Upload sequence wrote the DB record before Storage ⇒ a crash left a product without an image, and the retry was treated as a duplicate | High | Storage first, transaction second; orphan-blob sweep; truncation check (JPEG end marker) |
| A4 | Device 401/403 told firmware to "stop retrying" ⇒ photos lost when an admin later re-enabled the device | Medium | 401/403 keep the image and retry hourly; only 400/413/415 discard |
| A5 | Notification type `ORDER_UPDATE` could not be unique under the `{orderId}_{type}` ID rule | Medium | Types `NEW_ORDER` / `ORDER_CANCELLED` |
| A6 | Pending notifications stranded when a device was disabled/reassigned | Medium | Re-target in the same transaction, else `needsAdminAttention` |
| A7 | Deactivated potter's products still matched `status == 'approved'` | Medium | `suspended` status + `statusBeforeSuspend`, batch on (de)activation |
| A8 | `customers.blocked` cannot block guests | Medium | `blocked_phones` collection + admin endpoints |
| A9 | Per-IP failed-auth limiter could lock out legitimate devices sharing a CGNAT IP | Medium | Limiter throttles only requests that fail verification |
| A10 | Unknown-device vs wrong-secret differed in timing; 403 leaked device existence | Low | Always hash-compare (dummy hash); status checked only after a valid secret |
| A11 | AI price fields `min/max` differed from the PDF's `minimum/maximum` | Low | Aligned to PDF |
| A12 | AI-failed products had no defined status/flow; `approve` preconditions vague | Medium | Failed ⇒ `pending_review` + `ai_failed` flag; explicit approve preconditions |
| A13 | No customer-profile endpoint although `customers` is created lazily | Medium | `GET/PUT /api/me` |
| A14 | "Unacknowledged orders" filter had no data source (ack lives on notifications) | Medium | `GET /api/admin/notifications` queue; filter removed from orders |
| A15 | AI retry backoff had no field; worker claim index incomplete | Low | `aiNextAttemptAt` + indexes |
| A16 | Redundant frontend layers (`api/endpoints` vs `services`, `AuthProvider` in two places) and an unneeded `provision-device.js` script | Low | Consolidated: `api/client.js` + `services/`; provider only in `context/`; script removed (registration is an admin API) |
| A17 | `negotiatedPrice` unit/total ambiguity | Low | Per-unit, total = price × quantity |
| A18 | Admin-role revocation only on "sensitive" routes | Medium | `checkRevoked` on every admin route |
| A19 | Creation/system transitions missing from `order_history`; no rule against status regression | Low | Creation row (`previousStatus: null`); `seller_notified` only while `pending` |
| A20 | Pepper rotation undefined (would invalidate every device) | Medium | Superseded in the follow-up review: pepper **removed** (server-generated 256-bit secrets need none); per-device rotation only |

## 3. Residual risks and missing requirements (not fixable by documentation)

| ID | Risk | Severity | Mitigation / decision needed |
|----|------|:--:|--------------------------|
| R1 | **Admin staff is the order-follow-up channel** (no potter UI). With thousands of potters this needs a call-centre process | High (business) | Admin follow-up queue exists; decide staffing/SLA; consider SMS/IVR to potters post-v1 |
| R2 | A7670E band/operator compatibility, TLS support, 1.8 V UART, 2 A bursts, IMEI registration unverified | High (hardware) | Order and bench-test hardware now; fall back to ESP32-side TLS over PPP |
| R3 | One-button UX (capture vs acknowledge) untested with real potters | Medium | Pilot usability test; second button remains an option |
| R4 | Bengali text on device (TFT) | Medium | Digits-only vs server-rendered bitmaps — decide Phase 9 |
| R5 | Spam/fake orders reaching potters | Medium | OTP vs App Check decision in Phase 7 |
| R6 | Gemini quality/price suggestions for local pottery; model deprecation; data-use terms | Medium | Admin approval mandatory; `GEMINI_MODEL` env; evaluate on real photos in Phase 6 |
| R7 | Stolen device shows buyer PII | Low–Med | Show-until-ack, TTL, no persistence, instant disable |
| R8 | Potters bypassing the platform after receiving buyer contact (business model risk) | Business | Outside technical scope; flag to owner |
| R9 | Blaze billing/cost growth (Firestore, Storage, Gemini, cellular data) | Medium | Budget alerts, per-device caps, poll interval tuning |
| R10 | Data-retention/legal policy for buyer PII unspecified | Medium | Decide before Phase 10 |

## 4. Warning register (follow-up review)

The four WARNING rows each bundle several separate issues. This register lists them individually, plus issues that sit under PASS rows or only in §3 and were not labelled. **No status above was changed**; PASS rows 4, 8, 9, 10, 11 describe designs that are still untested, and the notes here say what remains unproven.

| ID | Source | Issue | Severity | Status | Resolve by |
|----|--------|-------|:--:|--------|-----------|
| W1a | Check 5 | A7670E TLS certificate verification unproven; unverified TLS exposes the bearer secret to a man-in-the-middle | High | Open; **gate H0** added | Before Phase 4 |
| W1b | Check 5 | Secret extractable from flash of a stolen unit | Medium | Mitigated by design (per-device secret, bounded blast radius, instant disable); flash encryption in Phase 8/10 | Phase 8 / 10 |
| W1c | Check 5 | Secret handled by humans during provisioning (shown in admin UI, flashed) | Medium | Procedure documented; needs a provisioning checklist | Phase 4 |
| W1d | Check 5 / A20 | Pepper rotation hazard | Medium | **Resolved by design change** (pepper removed) | Done |
| W2a | Check 15 | Scaffold logger doesn't redact `x-tracking-token` | Medium | **Resolved in Phase 2** (also redacts secrets, buyer phone/address; unit-tested) | Done |
| W2b | Check 15 | No git repository, `.gitignore` unverified, `.env` files exist locally, no secret scanner | Medium | **Partly resolved in Phase 2:** `git init` done, ignore rules verified with `git check-ignore` (17 secret patterns ignored, example/rules files tracked), dry-run `git add` shows no sensitive files. **Still open: secret scanner (gitleaks pre-commit/CI)** — not installed | Before first real credential is committed/used |
| W2c | Check 15 | Service-account privilege, base64 ≠ encryption, Gemini/Firebase key restrictions | Medium | Documented controls; applied when keys are created | Phase 2 / 6 |
| W3a | Check 16 / R1 | Admin staff is the human bottleneck for order follow-up | High (business) | **Open — needs an owner decision** | Before pilot (Phase 7 UI) |
| W3b | Check 16 | Reports by potter/district don't scale with `count()` | Low–Med | Planned (`stats`) | Phase 10 |
| W3c | Check 16 | In-memory rate limiter works for one instance only | Low–Med | Documented | Phase 10 |
| W3d | Check 16 | `lastSeen` writes ≈ US$15 / 1,000 devices / month at 5-min polling **[VERIFY]** | Low | Levers documented (poll interval, device cache) | Phase 10 |
| W3e | Check 16 | Search = one token per query | Low | Documented limitation | Later |
| W4a | Folder note | `web/` and `admin/` duplicate `api/client.js`, theme tokens, small components | Low | Accepted; backend is the single authority for enums | Re-evaluate at Phase 5 |
| U1 | Under checks 8/10 | Device-side upload reliability unproven (power loss during write, queue overflow, no feedback to potter after rejection) | Medium | Test cases added to Phase 8; `droppedUploads` telemetry added | Phase 8 |
| U2 | Under checks 9/11 | Notifications could sit unseen with **no automatic escalation** ("N hours" was undefined; offline device not flagged at order time) | High | **Resolved by design change**: escalation sweep, `device_offline` flag at creation, headline card; untested | Phase 7/9 tests |
| U3 | New | No MFA requirement for admin accounts (full buyer-PII access) | High | **Design added; NOT implemented in Phase 3** — Firebase MFA needs Identity Platform + enrolment UI (see ADMIN_AUTH.md §3). Compensating controls now: no public sign-up UI, role only via operator script, revocation on next request, failed-auth throttling | Before production / pilot |
| U4 | R5 | Buyer phone numbers are unverified: a third party's number can be used to order (harassment of strangers by potters) | Medium | Open decision (OTP vs App Check) | Phase 7 |
| U5 | R2 | Cellular availability/band/IMEI registration in Bangladesh unproven | High | Open; **gate H0** | Before Phase 4 |
| U6 | R3/R4/R6/R7/R8/R9/R10 | One-button UX, Bengali text, Gemini quality, stolen-device PII, bypass risk, cost growth, retention policy | Med | Open; see §3 | Per §3 |
| U7 | Audit report | Report cross-referenced the wrong sections (§3 vs §2) | Low | Fixed | Done |
| P2-1 | Phase 2 | Composite indexes verified only structurally (emulator doesn't enforce them) | Medium | Open: validate on first run against a real project | Phase 2 sign-off / Phase 10 |
| P2-2 | Phase 2 | Potter (de)activation updates products in idempotent batches, not one transaction | Low | Accepted, documented | Final audit |
| P2-3 | Phase 2 | Counter transactions contend on one document (slow under ~15 simultaneous registrations) | Low | Accepted (admin-driven, rare); retry budget raised | Final audit |
| P2-4 | Phase 2 | Secret scanner not installed (W2b remainder) | Medium | Open | Before real credentials exist |
| P2-5 | Phase 2 | Emulator tests need Java 21+ and `firebase-tools` (large dev dependency) | Low | Documented; not in production image | Phase 10 CI |
| P3-1 | Phase 3 | Admin flows verified only against the **emulators** (token signing keys, password-reset delivery, Email/Password provider config, MFA are not exercised) | Medium | Open: repeat the manual check from ADMIN_AUTH.md §5 against a real dev project | Phase 3 sign-off |
| P3-2 | Phase 3 | `checkRevoked` adds one Firebase Auth call to every admin request; Firebase revocation has 1-second granularity | Low | Accepted (admin-scale traffic); documented | Final audit |
| P3-3 | Phase 3 | Dashboard = ~38 `count()` queries per refresh (cached 15 s, auto-refresh 60 s per open tab) | Low | Accepted; revisit with `stats` aggregates (Phase 10) | Phase 10 |
| P3-4 | Phase 3 | `orders.needsAdminAttention` is only counted; it is not cleared when an order reaches a terminal status (Phase 7 must clear it) | Low | Open | Phase 7 |
| P3-5 | Phase 3 | Global search is exact-ID only (POT-/DEV-/ORD-); name/phone search needs list pages | Low | Partly resolved in Phase 4 (potter and device list pages have search); orders in Phase 7 | Phase 7 |
| P3-6 | Phase 3 | Sidebar sections Products/Orders/Customers/Reports are placeholder pages (each states its phase); Potters and Devices became real pages in Phase 4 | Info | By plan | Phases 5–10 |
| P3-7 | Phase 3 | Frontend has no component/E2E test framework: UI behaviour was verified by a manual browser run (steps recorded in ADMIN_AUTH.md §5); only pure logic is unit-tested | Medium | Open: add Playwright/Vitest in Phase 10 | Phase 10 |
| P3-8 | Phase 3 | `web/` and `admin/` now duplicate `lib/firebaseConfig.js` + `lib/firebase.js` (W4a drift risk) | Low | Accepted; re-evaluate at Phase 5 | Phase 5 |
| P3-9 | Phase 3 fix | **Local login failed with "Network error"** because Java was not installed, so the Auth emulator never started (connection refused; no request reached the backend). Fixed: Java discovery (`PATH` → `JAVA_HOME` → `.tools/jdk`) with an actionable message, persistent emulator data, and precise login diagnostics. Residual: the emulators still hard-require Java 21+ on every developer/CI machine; Java is not installed system-wide on this machine (a git-ignored copy lives in `.tools/`) | Medium | Fixed; residual dependency documented | Phase 10 CI |
| P3-10 | Phase 3 fix | Graceful `--export-on-exit` persistence was verified by exporting through the emulator hub and restoring on restart; a real Ctrl+C export was not exercised | Low | Open (manual check) | Phase 3 sign-off |
| P4-1 | Phase 4 | Device failure throttle (`utils/failureThrottle.js`) is in process memory: correct for one backend instance, not shared across several | Medium | Open: Redis or edge rate limiting before scaling out | Phase 10 |
| P4-2 | Phase 4 | `device_events` writes one document per heartbeat (≈288/device/day at 5 min); the 30-day TTL policy on `expireAt` is a console/CLI step not yet configured | Medium | Open: configure TTL with the other policies; consider a longer poll interval | Phase 10 |
| P4-3 | Phase 4 | Potters created before Phase 4 lack `nameLower`/`searchTokens` and phone reservations until `scripts/backfill-potters.js` runs (idempotent; reports duplicate phones instead of guessing) | Low | Open: run once per environment that holds older data | Phase 4 sign-off |
| P4-4 | Phase 4 | Potter search is prefix/word based with a 50-result cap and no full-text ranking; device search is Device-ID prefix only | Low | Accepted; external search engine is the documented upgrade path | Phase 10 |
| P4-5 | Phase 4 | Device-secret provisioning is manual (admin copies the secret into firmware config). A leaked chat/e-mail copy is only mitigated by *Issue new credentials*; no tamper-resistant provisioning (e.g. secure element) | Medium | Accepted for pilot; revisit with firmware (Phase 8) | Phase 8 |
| P4-6 | Phase 4 | Device flow verified only against the emulators and plain HTTP; real modem/TLS behaviour (Spike H0) and a real Firebase project are untested. No device simulator CLI was built (the emulator suite and `Invoke-RestMethod` calls act as the simulator) | Medium | Open | Phase 8 / sign-off |
| P4-7 | Phase 4 | A potter deactivation leaves the potter's devices stored as `active`; they are refused at request time (`403`) instead of being rewritten, so the device page still shows `Active` while the potter page explains the block | Low | Accepted; documented | Final audit |
| P4-8 | Phase 4 | A dev-only quirk: `node --watch` on Windows restarted the backend spuriously during browser testing (files under `node_modules` reported as changed). The dev servers are therefore run with `npm start`. (Re-confirmed in Phase 5: a forgotten Phase 3 watcher process restarted the backend right after an order was placed, so the tracking page showed "Cannot reach the server" with a retry button until the new process was up; no data was lost or duplicated.) | Info | Documented | — |
| P5-1 | Phase 5 | Catalogue **search, seller filter and "newest within a price range" run in memory over the newest 300 approved products** (Firestore cannot rank text or order with such a range). Exact up to 300 active listings; each such request reads up to 300 documents. Plurals/typos/Bangla text do not match | Medium | Open: external search index (e.g. Algolia/Typesense) or a precomputed index before the catalogue grows | Phase 10 |
| P5-2 | Phase 5 | No real product photos and no `sharp` resizing: the storefront shows whatever `public/products/**` objects exist (dev data uses generated SVGs; products without an image show a placeholder). Large originals served as `web` would hurt mobile data usage | Medium | Open | Phase 6 |
| P5-3 | Phase 5 | **Stock is reserved at order creation** and the only way to give it back is `OrdersRepository.cancel`, which has no admin endpoint/UI yet. Until Phase 7 an abusive or abandoned order holds stock until someone edits the data. Mitigations: per-IP and per-phone limits, duplicate guard, admin can see all orders | Medium | Open: expose admin cancel/status first thing in Phase 7; consider a reservation timeout | Phase 7 |
| P5-4 | Phase 5 | **Orders are not delivered to potters**: no `notifications` are created at checkout (Phase 9). A pending order is visible only to admins; the buyer is told the potter "will call", which is not yet true operationally | **High** (product-level) | Open: must be closed before any real customer is allowed to order | Phase 9 |
| P5-5 | Phase 5 | Cart is stored per browser (localStorage), not per account; no email verification or password reset in the storefront; guest tracking links are the only way to follow a guest order (lost link = lost tracking) | Low | Accepted; documented | Phase 10 |
| P5-6 | Phase 5 | Public catalogue and categories are cached 60 s per process and every storefront request is limited per IP (300/min): behind CGNAT many customers share one IP; order creation is limited per IP (15/10 min) | Low | Accepted; revisit with real traffic data | Phase 10 |
| P5-7 | Phase 5 | Storefront verified only on emulators and Chromium (Playwright); no automated component/E2E tests, no accessibility audit tool run, no Lighthouse/performance measurement, bundle is one 520 kB chunk (no code splitting) | Medium | Open | Phase 10 |
| P5-8 | Phase 5 | `blocked_phones` is not checked at order creation (Phase 7 design item); `idempotency_keys` documents have no TTL policy yet | Low | Open | Phase 7 / 10 |

## 5. Open decisions (still assumed)
Admin-only order status/price updates · one photo = one draft product · Blaze billing · customers cannot self-cancel in v1 · retention policy · staffing for order follow-up (W3a).

## 6. Recommendation
The architecture is **ready for approval** conditional on the prerequisites in the Phase 1 approval recommendation: complete the Phase 1 follow-ups (W2a, W2b), create the Firebase project (asia-south1), order hardware and schedule spike H0 (W1a/U5), and decide W3a. Phase 2 may start once W2a and W2b are closed; H0 only gates Phase 4.
