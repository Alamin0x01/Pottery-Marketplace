# AI-Powered Pottery Marketplace with IoT Integration

Mati is a handmade-pottery marketplace for Bangladesh: a customer storefront, an admin dashboard and a REST API, on Firebase (Authentication + Firestore) and Vercel, with a planned ESP32-S3 device for potters.

**Demo video:** [Watch on YouTube](https://www.youtube.com/watch?v=BntG-A9cGMc)

Requirements: [docs/cloudcamp.pdf](docs/cloudcamp.pdf) · Design and roadmap: [docs/README.md](docs/README.md) (analysis, architecture, database, API, roadmap)

## Features

**Built**
* **Customer marketplace** (`web/`): browse and filter products and categories, product details, featured potters, cart, checkout with Bangladesh districts, order confirmation, order tracking, sign-in, profile, saved addresses and order history.
* **Admin dashboard** (`admin/`): role-based sign-in (`admin`, `superadmin`), overview and activity, orders and products lists, search, admin list (superadmin only).
* **Potter and device management**: register potters, register and assign devices, issue and revoke device credentials, device events and audit trail.
* **Device API**: authenticated heartbeat endpoint for devices.
* **Security**: Zod-validated input on every route, Firebase ID-token checks, role checks, rate limits, CORS allow-list, Helmet, deny-all Firestore rules.
* **Demo mode**: fixed demo accounts and a demo login panel for judges (development only, see [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md)).

**Planned, not built yet**
* Photo upload from the potter's device, AI draft listings with Gemini ([specs/001-gemini-listing](specs/001-gemini-listing/spec.md)), RAG, ESP32-S3 firmware, notifications, and a cloud-storage decision for real product photos. Product images today are static demo files.

## What is used

| Layer | Technology |
|-------|------------|
| Customer site and admin | React, React Router, Vite, Tailwind CSS, Axios |
| API | Node.js, Express, Zod, Helmet, express-rate-limit, Pino |
| Auth and database | Firebase Authentication, Cloud Firestore (Firebase Admin SDK on the server) |
| Local development | Firebase emulators (Firestore, Auth) |
| Hosting | Vercel Hobby (three projects) on the Firebase Spark plan, free tier only |
| Testing | Node test runner (backend, web, admin), Firebase rules unit testing |
| Planned | ESP32-S3 firmware, Gemini API |

## Workflow

1. **Admin setup:** an operator creates admin accounts with a trusted script (there is no public sign-up for admins).
2. **Onboarding:** an admin registers a potter, then registers a device and assigns it to that potter. Credentials are issued once and can be revoked.
3. **Listing:** products are stored in Firestore. Today they are seeded demo data; device photo upload and AI-drafted listings are planned.
4. **Shopping:** a customer browses, adds to cart, checks out and gets an order confirmation. Orders can be tracked and appear in the account history.
5. **Fulfilment:** admins see orders, products and device activity in the dashboard.
6. **Development flow:** audit, plan, approve, implement, verify, as described in [AGENTS.md](AGENTS.md).

Both clients call the Express API, which verifies the Firebase token and role, validates input and talks to Firestore. The browser never reads Firestore directly.

## Project layout

| Folder | Purpose | Dev port |
|--------|---------|----------|
| `backend/` | Node.js + Express REST API | 4000 |
| `web/` | Customer marketplace (React, Vite, Tailwind) | 5173 |
| `admin/` | Admin dashboard (React, Vite, Tailwind) | 5174 |

`firmware/` (ESP32-S3) and `tools/device-simulator/` are created in the phases that need them.

## Prerequisites
Node.js 22+ (developed on Node 24) and npm. For the Firebase emulators (local database): **Java 21+** (`winget install EclipseAdoptium.Temurin.21.JDK`, then a new terminal). `npm run emulators` tells you plainly if Java is missing; without the emulators the admin login cannot work locally. To use a real Firebase project instead, follow [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

## Run locally
```powershell
# 1. Firebase emulators (terminal 1). Data persists between runs in backend/emulator-data (Ctrl+C to stop)
cd backend
npm install
npm run emulators                # Firestore :8080, Auth :9099, Storage :9199

# 2. Backend (terminal 2)
cd backend
Copy-Item .env.example .env      # then enable the emulator block (or fill in a real project)
npm run check:firebase           # validates config + read-only connectivity probe
npm run dev                      # http://localhost:4000/health  and  /health/ready

# 3. Customer site (new terminal)
cd web
npm install
Copy-Item .env.example .env.local   # add the VITE_FIREBASE_* values (see FIREBASE_SETUP.md §6)
npm run dev                      # http://localhost:5173

# 4. Admin dashboard (new terminal)
cd admin
npm install
Copy-Item .env.example .env.local
npm run dev                      # http://localhost:5174
```
The customer site shows **API: online** (backend reachable, CORS OK) and **Firebase: configured** (web Firebase settings valid). The backend refuses to start with an invalid Firebase configuration and says why.

### Product images (Spark plan, demo only)
Demo product images are static files in `web/public/images/products/` (paths like `/images/products/clay-vase.jpg` stored in Firestore `products.images[]`). No Cloud Storage, no Blaze plan, no paid image host. Run `cd backend; npm run seed:images` after seeding to assign them. These are for demo products only; future ESP32 image uploads will require a suitable cloud storage solution. Details: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) §4.

### Deployment
Three Vercel projects (API as a serverless function, web, admin) on the Firebase Spark plan: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Judge demo accounts
Fixed **DEMO** accounts (superadmin, admin, customer, plus a DEMO potter record), a "Demo login" panel and a confidential credentials sheet are described in [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md). Passwords are never committed.

### Admin dashboard (Phase 3)
The admin app needs `VITE_FIREBASE_*` in `admin/.env.local` (for the emulators, `admin/.env.example` explains placeholder values) and an administrator account. Admins are created **only** by the trusted operator script — there is no sign-up and no API that grants a role:
```powershell
cd backend
node scripts/seed-demo.js          # optional: realistic demo data (emulator-only, refuses real projects)
node --env-file=.env scripts/manage-admin.js grant --email you@example.com --name "Your Name" --role superadmin --create
```
Then sign in at http://localhost:5174. Full guide, hardening checklist and troubleshooting: [docs/ADMIN_AUTH.md](docs/ADMIN_AUTH.md).

## Test
```powershell
cd backend; npm test                 # 41 unit tests, no emulator needed
cd backend; npm run test:emulator    # 43 integration, admin-API and security-rules tests (needs Java 21+)
cd web;     npm test; npm run build  # 4 tests
cd admin;   npm test; npm run build  # 7 tests
```

## Configuration and secrets
* Never commit `.env*` files (only `.env.example`). Backend secrets (Firebase service account, Gemini key) are read from environment variables only; see `backend/.env.example`.
* Frontend `VITE_*` variables are **public** by design — never put secrets in them (the web app refuses to start if it finds an Admin credential there).
* `CORS_ORIGINS` must list the deployed customer and admin origins.

## Troubleshooting
* *API badge says offline*: backend not running, `VITE_API_URL` wrong, or the frontend origin is missing from `CORS_ORIGINS` (restart the backend after editing `.env`).
* *`VITE_API_URL is not set`*: create `.env.local` from `.env.example`, restart `npm run dev`.
* *Port already in use*: the Vite ports are fixed (`strictPort`) so CORS settings stay predictable; stop the process using the port.
* *Backend exits with "Invalid environment configuration"*: the message names the offending variable.
