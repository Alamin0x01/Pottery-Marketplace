# AGENTS.md: rules for AI coding assistants working on Mati

Mati is a handmade-pottery marketplace for Bangladesh: customer site (`web/`), admin dashboard (`admin/`) and an Express API (`backend/`), on Firebase (Authentication + Firestore) and Vercel. Read `README.md` and `docs/` first.

## Hard rules
1. **Free tier only.** Firebase Spark plan and Vercel Hobby. Never enable Cloud Storage, upgrade to Blaze, or add a paid image host.
2. **No secrets in git.** Never commit `.env*`, service-account JSON, private keys, API tokens or demo passwords. Never print them in output. Frontend `VITE_*` variables are public: no secrets there.
3. **Approval before production actions.** Ask the human before: creating or deleting Firebase users, deploying Firestore rules or indexes, seeding or changing production data, committing, pushing, or deploying. Show the exact diff or command first.
4. **Do not change production data** unless the task says so explicitly.
5. **Preserve behaviour.** Keep authentication, role checks (`admin`, `superadmin`, customer), validation (Zod), rate limits and CORS intact. Do not remove features to make a deployment pass.
6. **Demo mode is development-only.** `VITE_DEMO_MODE` and demo credentials must never reach a production build.
7. **Say what is planned vs built.** Do not describe unbuilt features (device photo upload, Gemini listing, RAG) as working.

## Workflow (audit, plan, approve, implement, verify)
1. Audit: read the code and report findings; change nothing.
2. Plan: list files, environment variables, risks and limitations.
3. Wait for approval for anything touching production.
4. Implement in small steps; match existing style; add tests only for new behaviour.
5. Verify: run tests and builds, check live URLs when deployed, scan staged changes for secrets.

## Commands
- Backend: `cd backend; npm test` (unit), `npm run dev` (local API, port 4000), `npm run emulators` (needs Java 21), `npm run check:firebase`.
- Web: `cd web; npm test; npm run build` (dev server port 5173).
- Admin: `cd admin; npm test; npm run build` (dev server port 5174).
- Demo accounts: see `docs/DEMO_ACCOUNTS.md`. Deployment: see `docs/DEPLOYMENT.md`.

## Where things live
- API routes and middleware: `backend/src/routes`, `backend/src/middleware`; Vercel entry: `backend/api/index.js`.
- Schemas and enums: `backend/src/db`; Firestore rules (deny-all) and indexes: `backend/firebase/`.
- Static demo images: `web/public/images/products/` (demo only; real device photos need a cloud-storage decision).

## Conventions
- Node 24 (API) and Node 22 (web, admin); ES modules; Zod strict schemas on all input.
- Comments only where the code needs clarification. Never log phone numbers, addresses or tokens.
