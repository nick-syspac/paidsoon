---
mode: agent
description: Build a dispute pause flow for PaidSoon invoices.
---

# Build Dispute Pause Flow — PaidSoon

## Role
You are a senior full-stack engineer implementing a dispute-aware pause flow for PaidSoon.

## Goal
Allow PaidSoon users to mark an invoice as disputed, automatically pausing all email follow-ups until the dispute is resolved or dismissed.

> **Important:** This feature is **not currently implemented**. Build it from scratch following PaidSoon conventions.

## PaidSoon Context
PaidSoon has a `paused` status on `TrackedInvoice`. Currently, pause/resume is a manual user action. A dispute pause extends this concept with a `reason = "dispute"` qualifier and optionally captures dispute details.

## Files to Inspect
- `prisma/schema.prisma` — `TrackedInvoice` model and its `status` enum
- `app/api/invoices/[id]/pause/route.ts` — existing pause route
- `app/api/invoices/[id]/resume/route.ts` — existing resume route
- `prisma/rls-policies.sql` — RLS policies (pattern to follow)
- `components/dashboard/InvoiceTable.tsx` — action buttons
- `lib/db/withUserContext.ts` — DB access pattern

## Schema Considerations

Consider adding to `TrackedInvoice`:
- `pauseReason String?` — e.g., `"dispute"`, `"other"`, `null`
- `disputeNote String?` — optional description of the dispute

These are nullable additions to the existing model. Run `npx prisma migrate dev --name add-dispute-fields` after editing the schema.

## Implementation Rules

### API Route
The existing `POST /api/invoices/[id]/pause` can be extended OR a new route created:
`POST /api/invoices/[id]/dispute`
- Authenticate via `supabase.auth.getUser()`
- Validate body: `{ note?: string }`
- Use `withUserContext(userId, fn)`
- Set `status = "paused"`, `pauseReason = "dispute"`, store note
- Return updated invoice

### Resume Route
The existing `POST /api/invoices/[id]/resume` can handle dispute resolution:
- Clear `pauseReason` and `disputeNote` on resume
- Set `status` back to `pending`
- Optionally accept a `resolution` note in the body

### UI
- Add a "Dispute" button in `InvoiceTable.tsx`
- Visually distinguish disputed invoices (e.g., "Paused (Dispute)" badge)
- Dispute modal to capture optional note

### Email Gate
- Disputed invoices have `status = "paused"` — the cron job already skips them
- No cron changes needed

### Tests
- Test that marking as disputed pauses email sequence
- Test that resuming from dispute restores pending status
- Stub DB in tests

## Expected Output

1. Schema migration (if fields added)
2. Updated `prisma/rls-policies.sql` (if new fields require policy change)
3. Updated/new API route(s)
4. UI changes in `InvoiceTable.tsx`
5. Tests in `tests/`
6. `docs/DDD.md` update

## Acceptance Criteria
- Disputed invoice has `status = "paused"` and `pauseReason = "dispute"`
- No emails sent to disputed invoices
- Dispute clears correctly on resume
- `npm run test` passes
- No TypeScript errors
