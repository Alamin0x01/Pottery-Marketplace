# Customer Marketplace (Phase 5)

The public storefront in `web/` (React + Vite + Tailwind) and the backend routes that serve it. Contracts: [API_DESIGN.md §13](API_DESIGN.md#13-implemented-in-phase-5-storefront-contract). Data model: [DATABASE_DESIGN.md](DATABASE_DESIGN.md) §3.3–3.5, §3.9.

## 1. Run it locally

```powershell
cd backend ; npm run emulators               # terminal 1 (Auth 9099, Firestore 8080, Storage 9199; needs Java 21)
cd backend ; npm start                       # terminal 2 (http://localhost:4000)  -- use "start", not "dev" (see audit P4-8)
cd web     ; npm run dev                     # terminal 3 (http://localhost:5173)
```

`web/.env.local` (git-ignored) for the emulators:

```
VITE_API_URL=http://localhost:4000/api
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-pottery.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-pottery
VITE_FIREBASE_APP_ID=1:000000000000:web:demo
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
```

`backend/.env` must list the web origin in `CORS_ORIGINS` (already `http://localhost:5173`). For a real project use the real Firebase *web* settings (public values) and no emulator flags; see [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

### Development data (emulators only)

There are no real product photos until devices upload them (Phase 6) and no admin product-approval UI yet (Phase 6). To see a populated shop:

```powershell
cd backend
node --env-file=.env scripts/seed-demo.js              # fresh emulators: potters, devices, products, orders
node --env-file=.env scripts/seed-catalog.js 12        # optional: more approved products (pagination demo)
npm run seed:images                                    # assigns the static demo images (web/public/images/products) + marks 3 products/potters featured
```

The first two refuse to run against a real Firebase project. `seed:images` only writes Firestore and may be run against a real Spark project; it skips products that already have an image (`node --env-file=.env scripts/seed-images.js --all` re-assigns). Images are static files served by the web app, stored in Firestore as `/images/products/<file>.jpg` paths (see [FIREBASE_SETUP.md §4](FIREBASE_SETUP.md)); **they are for demo products only: future ESP32 uploads will need a suitable cloud storage solution.** A product without any image shows a "Photo coming soon" placeholder.

## 2. What the storefront does

| Area | Behaviour |
|------|-----------|
| **Accounts** | Register (Firebase Auth email/password in the browser, then `PATCH /api/customers/me` creates the profile), sign in, sign out, session restored on reload (Firebase persistence), profile (name/phone), up to 5 saved addresses with a default. `/account/**` is protected; visitors are sent to sign-in and back |
| **Customers vs admin** | Customers have no role claim. Every `/api/admin/*` call is `403`, and the admin app refuses their login ("does not have administrator access") |
| **Home** | Hero, featured products (falls back to "New arrivals" when nothing is featured), popular categories (real counts), featured potters (only those with approved products), craft intro, why handmade, how ordering works. **No testimonials section:** there is no genuine review data, so none is shown |
| **Shop** | Search, category, min/max price, sort (newest, price low→high / high→low), "Load more" cursor paging, skeleton cards, empty/error states, active-filter chips. All filters live in the URL (shareable, back-button safe) |
| **Product page** | Photo, name, price, stock wording (`In stock`, `Only N left`, `Sold out`), description, category, material **only when known**, maker and location, quantity selector, Add to cart, Order now. Nothing else is invented |
| **Cart** | localStorage, IDs and quantities only. Prices/availability are re-read from the backend on every visit. Over-stock lines get "Only N available · Update to N", vanished or sold-out items are flagged and excluded, subtotal counts only orderable quantities, max 10 lines |
| **Checkout** | Name, phone, delivery address, district (64), per-item quantity, order summary, saved-address picker (signed-in). Guest checkout allowed. One order **per product** (each order belongs to one potter). Client validation mirrors the API; API field errors are shown too |
| **Order request model** | No payment. Copy says "request" everywhere; `pending` and `seller_notified` explicitly say the potter has *not* accepted |
| **Duplicates** | One idempotency key per (checkout attempt, product), kept in `sessionStorage`; a double click or retry replays instead of duplicating; the 10-minute duplicate guard covers a new attempt |
| **Tracking** | Signed-in: `/account/orders` and `/account/orders/:id`. Guest: `/track/:id#<token>` (token in the URL fragment, never sent or logged; moved to `X-Tracking-Token`), phone masked |
| **Order status** | All nine PDF statuses with plain-language meaning, a progress tracker, cancelled notice, history timeline, listed vs negotiated price, courier/tracking number when present |
| **Responsive** | Mobile menu and collapsible filters; no horizontal overflow at 390, 768 and 1024 px (checked in the browser on home, shop, product, cart, login, register) |

## 3. Design decisions

* **Stock is reserved at order time**, not at confirmation (the Phase 1 design). With phone negotiation the confirmation can come hours later; reserving immediately is the only way two buyers can never be promised the last piece. Cancelling returns the units (`OrdersRepository.cancel`, tested). Trade-off: a fake order can hold stock until an admin cancels it; mitigated by rate limits, the duplicate guard and admin visibility. The admin cancel/status screen is Phase 7 (audit P5-3).
* **One order per product.** The data model (and the potter-device notification) is per product/potter; a multi-product cart therefore creates several orders, reported individually (partial success is shown, failed items stay in the cart).
* **Search is in-memory over the newest 300 listings** (audit P5-1) because Firestore cannot rank text. Everything else is an indexed query.
* **Customer address list is embedded in `customers/{uid}`** (max 5) and updated in a transaction.
* **Cart in localStorage, not Firestore.** It holds no prices, so a tampered cart can only change quantities, which the server re-validates at checkout. A signed-in cart is therefore per browser, not per account.
* **No Firestore/Storage client SDK in the browser** (unchanged): the web app only uses Firebase Auth; demo images are static `/images/products/**` files served by the web app (no Storage).

## 4. Tests

```powershell
cd backend ; npm test                # 50 unit
cd backend ; npm run test:emulator   # 84 integration (18 new in marketplace.test.js); stop dev emulators first
cd web     ; npm test ; npm run build   # 14 logic tests (cart, validation, phone parity, status coverage, API contract)
```

`backend/tests/emulator/marketplace.test.js` runs the real Express app against the emulators:

| # | Requirement | Test |
|---|-------------|------|
| 1 | Customer registration | `1.` (profile creation, email from token, strict body) |
| 2 | Login | `2.` (fresh token reads the same profile) |
| 3 | Product listing | `3.` (approved + in stock only, allow-listed payload, no private data) |
| 4 | Filtering | `4.`, `4b.` (category, price range, sorts, search, potter filter, cursors, invalid combinations) |
| 5 | Product details | `5.` (approved only, material never invented, sold-out shown unavailable, public image paths only) |
| 6 | Cart | `web/tests/web.test.js` (add/merge/limits/stock/sanitising/server-state validation/subtotal) + browser run |
| 7 | Checkout validation | `8.` (17 invalid bodies, nothing created, stock untouched) |
| 8 | Order creation | `7.` (potter from the product, token hash only, stock reserved, history row) |
| 9 | Duplicate prevention | `9.` (replay, mismatch, 6 concurrent identical requests = 1 order, different-key duplicate, re-order after cancel) |
| 10 | Stock validation | `10.` (8 concurrent buyers for 3 units, sold-out leaves the shop, cancel restores once) |
| 11 | Order history | `11.`, `12.` (own orders, pagination, status timeline, negotiated price) |
| 12 | Customer data isolation | `11.` (other customer, anonymous, wrong token → 404; own-orders lists disjoint), `2b.` (addresses) |
| 13 | Unauthorized access | `13.` (401 without/with garbage token; customer token → 403 on all admin APIs), rate-limit test |
| 14 | Mobile responsiveness | Browser run (not automated): 390/768/1024 px overflow check + screenshots |

### Browser run (against the emulators, recorded results)

Registered a customer (empty-form errors, then success), saved two addresses, switched the default, edited the profile; added products to the cart, reloaded (cart persisted), checked out as a **guest** (validation errors, then the order; tracking link opened, phone masked) and as the signed-in customer (saved address pre-filled, **double-click produced exactly two orders**); order list and detail; sign out, protected-route redirect back to the intended page, invalid login ("Invalid email or password."), sign in again, reload kept the session; a second customer saw "Order not found" for the first customer's order and an empty list; the admin app refused the customer account; cart with 40 units of a 3-unit product and a deleted product showed the stock/availability warnings; shop filters (category, sort, price, search, empty state, load more).

## 5. Not done / limitations (tracked in [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md), P5-*)

* No **real product photos** and no **admin product approval screen**: products reach `approved` only through scripts/tests until Phase 6. Image variants (`web`/`thumb` resizing) are not generated; the storefront uses whatever `public/products/**` objects exist.
* **Orders are not delivered to potters yet**: no notification documents are created (Phase 9). Pending orders are visible to admins in the dashboard only.
* **No customer self-cancel** and no admin cancel/status UI (Phase 7); the cancel repository method is tested but not exposed.
* **Testimonials** are not shown (no data). **Reviews/ratings** do not exist.
* No email verification or password reset in the storefront (Firebase supports both; not wired).
* Cart is per browser. Search is limited to the newest 300 listings. `blocked_phones` is not checked yet (Phase 7).
* Verified only against the **emulators**; no real Firebase project, real Storage CDN or production build deployment was exercised.
* No automated UI/component tests (logic tests + manual browser run), as for the admin app (P3-7).
