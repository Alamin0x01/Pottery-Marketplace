# Project Analysis

Source: `docs/cloudcamp.pdf` (16 pages, read in full). This document turns the PDF into components, requirements, workflows, risks and decisions. Companion documents: [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) · [DATABASE_DESIGN](DATABASE_DESIGN.md) · [API_DESIGN](API_DESIGN.md) · [DEVELOPMENT_ROADMAP](DEVELOPMENT_ROADMAP.md).

Legend: **[VERIFY]** = factual claim that must be checked (datasheet, operator, vendor, pricing page) before being relied on. **[ASSUMPTION]** = interpretation of an ambiguous requirement.

---

## 1. Goal

Let traditional potters in Bangladesh, many with very limited literacy and digital skills, sell handmade pottery online **without operating a smartphone or computer**. A potter presses one physical button on an IoT device; the platform turns the photo into a draft listing with AI, an admin reviews and publishes it, and when a customer orders, the buyer's contact details appear on the potter's device so the potter can phone the buyer and negotiate.

## 2. System components

| # | Component | Technology | Purpose |
|---|-----------|-----------|---------|
| C1 | Customer marketplace | React, Vite, Tailwind, React Router, Axios (Vercel) | Browse, search, order, track |
| C2 | Admin dashboard | Same stack, separate app (Vercel) | Operate the whole platform |
| C3 | Backend API | Node.js, Express, Firebase Admin SDK (Railway/VPS) | Single gateway: authN/Z, validation, business rules, AI orchestration |
| C4 | Firebase Authentication | Firebase Auth | Identity for admins and (optional) customers |
| C5 | Cloud Firestore | Firestore | System of record |
| C6 | Firebase Storage | Cloud Storage for Firebase | Original and web-optimised photos |
| C7 | Gemini API | Google Gemini (multimodal/vision) | Image → structured product data |
| C8 | Potter IoT device | ESP32-S3 + camera, A7670E 4G, TFT, button, battery, buzzer/LED | Capture/upload photos, show order notifications |
| C9 | Device simulator | Node script (dev tool) | Test device APIs before hardware exists |

The potter is **not** a software user: there is no potter login, UI or API of their own. Their identity is the credential of the device(s) they own.

## 3. Actors

| Actor | Authenticates with | Can do |
|-------|-------------------|--------|
| Anonymous visitor | none | Browse approved products, place guest order, track order with token |
| Customer (optional account) | Firebase Auth | Same + order history |
| Admin / Superadmin | Firebase Auth + custom claim | Everything operational |
| Device | Device ID + secret | Upload photos, poll/acknowledge notifications, heartbeat |
| Potter | (via device only) | Press the button; read screen; phone buyer |
| System/worker | internal | AI jobs, notification creation |

## 4. Functional requirements

### 4.1 Customer marketplace (PDF §6)
* FR-C1 Home: hero, featured products, popular categories, craftsmanship intro, featured potters, search.
* FR-C2 Shop: product grid, search, category filter, price filter, sorting, pagination/efficient loading.
* FR-C3 Product page: images, name, description, price, category, seller info (public-safe), availability, order button.
* FR-C4 Checkout: name, phone, delivery address, quantity, confirmation. **Order-request model, no online payment.**
* FR-C5 Order tracking: statuses Pending, Seller Notified, Contacted, Price Negotiation, Confirmed, Processing, Shipped, Delivered, Cancelled.
* FR-C6 Customers must never see other customers' data.

### 4.2 Admin dashboard (PDF §7)
* FR-A1 Overview: total potters, total/online/offline devices, total products, pending approvals, total orders, pending orders.
* FR-A2 Potters: register, view, edit, activate/deactivate, see their products/orders.
* FR-A3 Devices: register (generate unique Device ID + secret), assign, reassign, deactivate lost/stolen, monitor connectivity, last-seen time.
* FR-A4 Products: list all, review AI descriptions, edit, approve, reject, remove.
* FR-A5 Orders: list all, filter by potter, view buyer info, update status, record negotiated price, track delivery.
* FR-A6 Reports: product, potter, order, device-connectivity statistics.
* FR-A7 UI: sidebar, responsive, analytics cards, data tables, search/filter.

### 4.3 Potter device (PDF §3)
* FR-D1 One button captures a photo; compress if needed; upload via cellular; no Wi-Fi/phone/browser dependency.
* FR-D2 Unique Device ID, associated with exactly one potter at a time.
* FR-D3 Reliable upload retries and **local image buffering** when offline.
* FR-D4 Poll for notifications over HTTP (no MQTT/WebSocket in the prototype); display buyer information; potter calls from own phone (calling module optional).
* FR-D5 Heartbeat so admins can see connectivity.

### 4.4 AI (PDF §8)
* FR-AI1 Store the original photo, send it to Gemini, return **structured JSON**: name, category, description, material, tags, suggested price range (BDT).
* FR-AI2 Must not invent dimensions, weight, production cost or material certainty; mark uncertain attributes `unknown`.
* FR-AI3 Listing requires admin approval before publication; AI never sets the final price.

### 4.5 Multi-potter (PDF §4)
* FR-M1 Hundreds–thousands of potters, unique Potter IDs (`POT-1001`) and Device IDs (`DEV-001`).
* FR-M2 Potter derived from **authenticated device credentials**; a Potter ID sent by a device is never trusted.
* FR-M3 A potter may own several devices; each ownership link is explicit.
* FR-M4 A potter only receives notifications about their own products/orders.

### 4.6 Order workflow (PDF §10)
Customer request → order created → product's potter found → potter's device found → notification created → device polls → potter sees buyer info → phone negotiation → agreement recorded → courier dispatch → status updates → customer tracks. Must support **notification retries, duplicate-request prevention, acknowledgment**; delivery ≠ acceptance.

### 4.7 API & platform (PDF §9)
Route modules for device/customer/admin/order; authentication, device authentication, RBAC, validation, error handling, rate limiting, secure uploads, logging; customer and potter data isolation.

## 5. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Security | No secrets in frontend/repo; HTTPS only; per-device credentials; least privilege; strict validation; audit trail for sensitive admin actions |
| Privacy | Buyer PII only to the owning potter's device and admins; minimal PII in logs |
| Reliability | Idempotent uploads and orders; retries with backoff; recoverable AI jobs; survive backend restarts |
| Scalability | Thousands of potters/devices: indexed queries, cursor pagination, aggregation counts, no full-collection scans |
| Performance | Product list < ~1 s on mobile data; upload endpoint returns quickly (AI is async); optimised image variants |
| Availability | Single Node instance acceptable for pilot; state in Firestore so instances are replaceable |
| Cost | Cellular data per device ≈ 150–200 MB/month **[VERIFY]**; Gemini call cap per device/day; Firestore reads minimised |
| Usability | Device: one button, large digits, sound/LED feedback; web: responsive, warm earthy design (terracotta/beige/cream/brown) |
| Maintainability | Layered modules, small dependency set, tests with Firebase emulators, living documentation |
| Observability | Structured logs with request IDs; device last-seen; AI job status; admin flags for stuck orders |
| Localisation | **English only for now** (owner decision); keep strings centralised where cheap |

## 6. Workflows

### 6.1 Customer
1. Browse/search/filter → product page → "Order".
2. Checkout (name, phone, address, quantity) → confirmation with Order ID + tracking link/token.
3. Track status; optionally create an account for history.

### 6.2 Admin
1. Sign in → dashboard.
2. Onboard potter → register device (secret shown once) → assign device → flash/provision device.
3. Review AI-generated drafts → edit, **set price**, approve/reject.
4. Order follow-up: watch unacknowledged/old orders → phone potter/buyer → record Contacted → Price Negotiation → negotiated price → Confirmed → Processing → Shipped (+courier info) → Delivered.
5. Lost/stolen device → disable immediately. Monitor offline devices.

### 6.3 Potter
1. Press button to photograph a product (hear beep/see "uploaded").
2. When a new order arrives: hear buzzer, read/see buyer name, big phone number, product; press button to acknowledge.
3. Phone the buyer using own phone; agree price/delivery. (Outcome reaches the platform via the admin; see gap G1.)

### 6.4 Device
Idle (deep sleep) → wake on button **or** timer → [button] capture → compress → queue → upload (retry/backoff) → feedback. [timer] power modem → HTTPS poll → show/beep notifications → acknowledge on press → sleep. Heartbeat occasionally.

### 6.5 AI
Upload accepted → job queued → worker claims job → Gemini (JSON schema) → validate/sanitise → write fields, `pending_review`, price empty → admin review. Failure → retry ≤3 → `failed` → manual completion.

## 7. Gaps and risks identified in the requirements

| ID | Finding | Resolution |
|----|---------|-----------|
| G1 | Potters have no UI, yet order status/price must be updated | Admin-only updates (admins phone potters); admin "follow-up queue"; operational process required |
| G2 | One button must capture **and** acknowledge | **Approved:** context-based — acknowledge while an order is shown, else capture. Acknowledged = *seen*, not *accepted* |
| G3 | Polling vs battery life | Deep sleep; timer wake every 5–10 min (server-configurable via `pollIntervalSec`) |
| G4 | Illiterate users; Bengali text rendering on TFT is hard | Buzzer + LED + large numerals; product thumbnail; optionally server-rendered 1-bit bitmaps for Bengali text (decide in Phase 9) |
| G5 | Spam/fake orders reach potters' phones | OTP or App Check/reCAPTCHA, rate limits, idempotency, admin block |
| G6 | Tracking for guests undefined | **Approved:** guest checkout + unguessable tracking token; accounts optional |
| G7 | "Product images" plural vs one photo per press | v1: one photo = one draft product; `images[]` in schema; admin removes duplicates |
| G8 | Device cannot supply price/stock | `price=null`, `stock=1` on drafts; approval requires admin-set price |
| G9 | No courier fields | Add `courierName`, `trackingNumber` (manual) |
| G10 | Bangla UI absent from PDF | **Owner: English only for now**; revisit before pilot |
| G11 | Stock semantics for order requests | Decrement in a transaction at **Confirmed**, not at request time |
| G12 | "HTTP-based communication" | Use HTTPS; plaintext would expose device secrets |
| G13 | PDF `potters.deviceIds` duplicates `devices.potterId` | Single source of truth: `devices.potterId`; drop the array |
| G14 | Cellular CGNAT shares IPs | Rate limit device routes by `deviceId`, not IP |
| G15 | Stolen device displays PII | Show only until acknowledged + TTL; never persist PII on device; remote disable |
| G16 | Gemini output is untrusted (prompt injection via photo text) | Schema validation, sanitisation, mandatory admin approval |
| G17 | *(audit)* Order idempotency cannot be enforced by a Firestore field; replay lost the tracking token | Deterministic `idempotency_keys` doc; token re-issued on replay; recent-duplicate guard |
| G18 | *(audit)* Upload could create a product record without a stored image | Storage write first, then transaction; orphan sweep |
| G19 | *(audit)* Deactivated potter's products stayed publicly queryable | `suspended` product status via batch on deactivation |
| G20 | *(audit)* Pending notifications could be stranded on a disabled/reassigned device | Re-target in the same transaction, else flag order |
| G21 | *(audit)* Guests could not be blocked (`customers.blocked`) | `blocked_phones` collection |
| G22 | *(audit)* Failed-auth IP limiter could lock out legitimate devices behind CGNAT | Limiter throttles only failed verifications |
| G23 | *(audit)* Reports by potter/district don't scale with `count()` per group | `stats` aggregates in Phase 10 |
| G24 | Customers cannot cancel orders via the API | v1: admin cancels on request; self-service later |

### Hardware notes **[VERIFY]**
* A7670E is an LTE Cat-1 module with GSM/EGPRS fallback: confirm supported bands against Bangladeshi operators (Grameenphone, Robi, Banglalink, Teletalk), operator plans, and BTRC/IMEI registration for imported modules.
* Bare module UART is 1.8 V; most breakout boards include level shifters — confirm.
* TX bursts up to ~2 A: use an 18650 Li-ion with protection/charging IC and bulk capacitance; brown-outs during upload are the most common field failure.
* ESP32-S3: choose the board by **pin budget** (camera + TFT + modem UART/PWRKEY + button + buzzer); octal PSRAM reserves GPIOs; need PSRAM for full JPEG frames.
* TLS requires correct time: read network time from the modem; embed the root CA; plan CA rotation/OTA (post-v1).
* Flash encryption (and secure boot if feasible) for production units.

### Platform notes **[VERIFY]**
* Cloud Storage for Firebase may require the Blaze plan; set budget alerts.
* Firestore location is permanent: **asia-south1 (Mumbai)** chosen.
* Firestore has no full-text search; v1 uses token arrays + indexes; external search engine is a later option.
* Gemini model names change: keep `GEMINI_MODEL` in env; confirm tier/data-use terms before sending images.

## 8. Out of scope for v1
Online payments, courier API integration, OTA firmware, MQTT/WebSockets, voice/IVR/SMS to potters, potter-facing app, external search engine, Bangla UI.

## 9. Decisions log

| Decision | Status |
|----------|--------|
| Separate `web/` and `admin/` apps | Approved |
| Context-based single button | Approved |
| Guest checkout + tracking token, optional account | Approved |
| English-only UI for now | Approved |
| Firebase region asia-south1 | Approved |
| Admin-only order status/price updates | Assumed — confirm |
| One photo = one draft product | Assumed — confirm |
| Blaze billing acceptable | Assumed — confirm |
| Bengali text on device (bitmap rendering vs digits-only) | Open — Phase 9 |
