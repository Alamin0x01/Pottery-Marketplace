# Database Implementation (Phase 2)

What was built for Cloud Firestore and how it maps to [DATABASE_DESIGN.md](DATABASE_DESIGN.md). Setup of the Firebase project itself: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## 1. Layout

```
backend/
├─ firebase/                     firebase.json (emulators), firestore.rules, storage.rules,
│                                firestore.indexes.json (GENERATED), .firebaserc.example
├─ scripts/                      check-firebase.js (connectivity), generate-indexes.js
└─ src/
   ├─ config/                    env.js (validation), firebase.js (Admin SDK, probes), logger.js
   ├─ db/
   │  ├─ collections.js          collection + counter names
   │  ├─ enums.js                statuses, categories, product transition table
   │  ├─ timestamps.js           serverTimestamp(), Timestamp -> ISO serialisation
   │  ├─ queryShapes.js          every supported list query (-> indexes)
   │  ├─ indexes.js              builds firestore.indexes.json from the shapes
   │  └─ schemas/                zod schemas (common, potters, devices, products, orders, accounts, system)
   └─ repositories/              the ONLY code that touches Firestore
      ├─ index.js                createRepositories(db) – wiring
      └─ counters / auditLogs / potters / devices / products / uploads /
         orders / notifications / accounts(customers, admins) .repository.js + query.js (pagination)
```
Rule (from SYSTEM_ARCHITECTURE §4): controllers/services call repositories; nothing else imports `firebase-admin/firestore`. Services arrive in Phases 3–9.

## 2. Collections, IDs and creation

| Collection | Document ID | Created by | Notes |
|-----------|-------------|-----------|-------|
| `potters` | `POT-1001…` (transactional counter) | `potters.create` | counter + document commit atomically |
| `devices` | `DEV-001…` (transactional counter) | `devices.register` | only a credential **hash** is accepted/stored |
| `products` | Firestore auto-ID (`products.newId()`) | `uploads.createWithDraft` | owner always read from the device record |
| `customers` | Firebase Auth uid | `customers.upsert` | guests have no document |
| `orders` | `ORD-` + 10 base32 chars (50 random bits) | `orders.createWithHistory` | unguessable |
| `notifications` | `{orderId}_{type}` | `notifications.create` | deterministic ⇒ no duplicates |
| `order_history` | auto-ID | with the order (same transaction) | append-only |
| `admins` | Firebase Auth uid | `admins.upsert` | directory only; the custom claim authorises |
| `counters` | `potter`, `device` | lazily, first use | stores the last issued number |
| `uploads` | `{deviceId}_{captureId}` | `uploads.createWithDraft` | idempotency record |
| `audit_logs` | auto-ID | inside the transaction of the audited change | secret-like keys are rejected |
| `idempotency_keys`, `blocked_phones` | — | **Phase 7** | names reserved; rules deny all |

## 3. Validation
* Every repository method validates its input with a **strict** zod schema (`src/db/schemas`): unknown fields are rejected, text is trimmed and stripped of control characters, Bangladeshi phones are normalised to `01XXXXXXXXX`, money is an integer 1…10,000,000, enums are closed.
* Failures are `400 ApiError`s listing field **paths and messages only** (never the offending values — so phones/secrets cannot leak into responses or logs).
* Schemas intentionally **omit** fields the caller must not choose: `potterId`/`deviceId`/status/AI fields for products, `potterId`/price/snapshot for orders, ownership for devices. Telemetry accepted from a device is a whitelist of five fields.

## 4. Timestamps
All timestamps are written as `FieldValue.serverTimestamp()` (never device or browser time). Reads are returned as ISO-8601 strings by `serialize()`. Expiry (`notifications.expiresAt`) is computed on the server.

## 5. Relationship consistency (enforced inside transactions)

| Rule | Where |
|------|-------|
| Device → potter ownership is stored once, in `devices.potterId` (no `potters.deviceIds`) | `devices.assign` |
| A device can only be assigned to an **existing, active** potter; `disabled`/`lost` devices must be re-enabled first; unowned devices cannot be activated | `devices.assign`, `devices.setStatus` |
| A product's `potterId` comes from the **device record**, and the device and potter must be active | `uploads.createWithDraft` (no `potterId` parameter exists) |
| Duplicate device captures create nothing (same product returned), even when concurrent | `uploads.createWithDraft` |
| An order's `potterId`, `listedPrice` and product snapshot come from the stored **product**; product must be `approved`, seller `active`, stock sufficient, customer (if any) must exist | `orders.createWithHistory` |
| Every order has a creation `order_history` row (same transaction) | `orders.createWithHistory` |
| A notification's target device must be an **active device of the order's potter**; creation is idempotent | `notifications.create` |
| Only the owning device can acknowledge a notification; others get `null` (→ 404). Acknowledging never changes order status | `notifications.acknowledge` |
| When a device stops being active or changes owner, its pending notifications move to another active device of the same potter, otherwise they expire and the order is flagged `needsAdminAttention` (`no_active_device`) — all in one transaction with the audit entry | `devices.assign`, `devices.setStatus` |
| Products follow their potter: deactivation suspends approved products, reactivation restores them; profile edits refresh the denormalised seller fields | `potters.setStatus`, `potters.update` |
| Product status changes follow an allowed-transition table; approval needs name, description, category, price ≥ 1 and stock ≥ 1; rejection needs a reason | `products.transition` |
| `credentialHash` is never returned by any repository read except `devices.getForAuth` | `devices.*` |

## 6. Security rules
* **Firestore** (`firestore.rules`): deny-all. The backend uses the Admin SDK, which bypasses rules, so rules are a safety net against accidental client access.
* **Storage** (`storage.rules`): only `public/products/{productId}/{file}` is readable (public), nothing is writable; originals under `uploads/**` are private.
* Verified by emulator tests: anonymous, signed-in and **admin-claim** clients are denied on every collection (read, list, create, update, delete); a client cannot assign devices/potters; Storage public read works only for the public path and every write/delete is denied.

## 7. Indexes and query efficiency
* All list queries are declared once as **shapes** in `src/db/queryShapes.js`; a shape names its equality filters, optional `array-contains`, and a single ordering field. Repositories can only run declared shapes — an unsupported combination is a `400`, never an un-indexed query.
* `firestore.indexes.json` is **generated** from the shapes (+ a reserved list for later phases): `npm run indexes:generate`. A unit test fails if the file is stale or a shape lacks its index. Currently 28 composite indexes.
* Pagination is cursor-based (`startAfter`), `limit` 1–100, fetching `limit+1` documents to compute `nextCursor`. No offsets, no collection scans, no client-side filtering of large sets.
* A price filter orders by price (ascending unless `sort=price_desc`) because Firestore allows a range filter on one field only.

## 8. Tests

| Command | What it needs | What it covers |
|---------|---------------|----------------|
| `cd backend; npm test` | nothing | 32 tests: env/Firebase config validation (modes, mismatches, no secret echo), IDs, phones, search tokens, schemas (strictness, no ownership fields), index/shape consistency, logger redaction, health/readiness routes |
| `cd backend; npm run test:emulator` | Java 21+ | 31 tests against the **real emulators**: connectivity probe, `/health/ready`, server timestamps, concurrent counters, CRUD + audit, ownership rules, upload idempotency, status machine, suspension, listing/pagination, order creation rules, notification rules, **security rules** |
| `cd web; npm test` | nothing | 4 tests: web Firebase config validation (missing values, Admin credentials refused, emulators refused in production builds) |
| `cd backend; npm run check:firebase` | `.env` | read-only connectivity check of the configured project/emulators |

## 9. Known limitations and deferred items (tracked for the final audit)
1. **Indexes are not verified by the emulator** (it does not enforce composite indexes). They are checked structurally against the query shapes; the first run against a real project (§FIREBASE_SETUP step 10–11) is the real validation.
2. Draft products store `name`, `description`, `category` as `null` until AI/admin fill them (the design table lists them as strings).
3. Potter deactivation/reactivation updates products in batches **after** the potter document commits. It is idempotent (re-run the same call to finish), but not one atomic transaction; a product edited by an admin in that instant could be overwritten. Low probability; acceptable for v1.
4. Counter transactions serialise on one document; the emulator showed heavy contention at ~15 simultaneous registrations (slow, still correct, retries raised to 25). Real registrations are admin-driven and rare.
5. Device-secret generation/hashing, `authDevice`, and the admin custom-claim script are **Phase 3–4**; this phase stores and protects hashes but does not create them.
6. `idempotency_keys`, `blocked_phones`, notification `markDelivered`, the escalation sweep, AI-result writing, and the order state machine/price/stock updates belong to Phases 6, 7 and 9.
7. `orders.createWithHistory` does not yet create the notification, the idempotency record or decrement stock (Phase 7 composes those).
8. TTL policies (`uploads`, `idempotency_keys`) are not configured (console/CLI step, Phase 10).
9. `firebase-tools` (a large dev dependency) is used only for emulators/deploys; it is not installed in production images (`npm ci --omit=dev`).
