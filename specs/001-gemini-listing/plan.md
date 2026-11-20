# Plan 001: AI draft listing (PLANNED)

## Approach
Reuse the existing API on Vercel; add a small worker path and one model call. No new infrastructure and no Cloud Storage.

## Components
- **Upload endpoint** `POST /api/device/captures`: device-authenticated (existing middleware), body-size limit, stores the JPEG as a base64 field in a separate Firestore document (size-capped), creates the draft via the existing uploads repository (`createWithDraft`).
- **AI service** `backend/src/services/ai/`: `prompt.js` (fixed prompt), `schema.js` (Zod and JSON schema), `gemini.service.js` (one call, timeout), `sanitize.js`.
- **Trigger:** Vercel Cron (or an admin "generate" button) processes queued drafts; each attempt is recorded and capped at 3.
- **Admin UI:** the existing product list shows `aiStatus`; an admin edits and approves.

## Decisions
- Hosted Gemini, Flash-class model set by `GEMINI_MODEL`; key only in Vercel environment variables (never in the frontend).
- Treat model output as untrusted data: schema validation, category allow-list, length limits.
- Data stays in Firestore (Spark quota); images are downscaled before upload.

## Risks
Free-tier model quota, Vercel body limit (4.5 MB), Firestore document size (1 MB), cold starts. Mitigations: daily cap, small JPEGs, manual fallback.

## Test plan
Unit tests for schema and sanitiser, an idempotency test for duplicate uploads, an integration test with a stubbed model, and a labelled sample set to measure validity and acceptance rates.
