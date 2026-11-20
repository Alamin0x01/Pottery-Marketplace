# Tasks 001: AI draft listing (PLANNED)

- [ ] T1 Define the output schema and allowed categories (`schema.js`) with unit tests
- [ ] T2 Write the fixed prompt and sanitiser (`prompt.js`, `sanitize.js`) with tests for malformed output
- [ ] T3 Implement `gemini.service.js` (one call, timeout, stub for tests)
- [ ] T4 Add `POST /api/device/captures` (auth, size limit, base64 image doc, idempotent draft creation)
- [ ] T5 Worker/cron to process queued drafts (max 3 attempts, set `aiStatus`)
- [ ] T6 Daily call cap and per-IP limits; `GEMINI_MODEL` and key as Vercel environment variables
- [ ] T7 Admin UI: show `aiStatus`, edit and approve; manual fallback
- [ ] T8 Evaluation script on a labelled sample: validity and acceptance rates
- [ ] T9 Update docs (`API_DESIGN.md`, `DEPLOYMENT.md`) and re-run all tests and builds

Rule: do not mark a task done until its tests pass.
