# Spec 001: AI draft listing from a potter's photo (PLANNED, not built)

## Problem
A village potter cannot type a product listing. Each piece needs a name, category, description and tags before it can be sold.

## Users and goals
- **Potter (via device):** takes one photo; nothing else.
- **Admin:** reviews and approves every draft before it is public.
- **Customer:** sees accurate, readable listings.

## Requirements
1. A device uploads a small JPEG (<= 700 KB) with a unique capture ID; retries never create duplicates (existing idempotency design).
2. The server queues a draft product (`aiStatus=queued`, `status=draft`).
3. A worker calls Gemini once per photo with a **fixed prompt** and a **JSON schema** (name, category from the allowed list, description, tags, material).
4. Output is validated (Zod) and sanitised; invalid output retries at most 3 times, then `aiStatus=failed` and the admin fills the fields manually.
5. The draft moves to `pending_review`. **Only an admin can approve.** AI never sets prices or publishes.
6. Only the photo and public fields are sent to the model; no personal data.
7. A daily call cap and per-IP limits protect the free quota.

## Non-goals
Pricing, automatic publishing, fine-tuning, local models.

## Acceptance criteria
- A draft with valid fields appears in the admin queue within 60 s of upload (when the model is available).
- Invalid or empty model output never reaches the database.
- A duplicate upload returns the original product.
- With the model unavailable, the admin can still create the listing manually.

## Measures
Schema-validity rate, admin acceptance rate without edits, calls per day.
