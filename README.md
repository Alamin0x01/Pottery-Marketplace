# AI-Powered Pottery Marketplace with IoT Integration

Requirements: [docs/cloudcamp.pdf](docs/cloudcamp.pdf) · Design and roadmap: [docs/README.md](docs/README.md) (analysis, architecture, database, API, roadmap)

| Folder | Purpose | Dev port |
|--------|---------|----------|
| `backend/` | Node.js + Express REST API | 4000 |
| `web/` | Customer marketplace (React, Vite, Tailwind) | 5173 |
| `admin/` | Admin dashboard (React, Vite, Tailwind) | 5174 |

`firmware/` (ESP32-S3) and `tools/device-simulator/` are created in the phases that need them.

## Prerequisites
Node.js 20.6+ (developed on Node 24) and npm. For the Firebase emulators (local database): **Java 21+** (`winget install EclipseAdoptium.Temurin.21.JDK`, then a new terminal). `npm run emulators` tells you plainly if Java is missing; without the emulators the admin login cannot work locally. To use a real Firebase project instead, follow [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

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
# Pottery-Marketplace
