---
mode: agent
description: Build a promise-to-pay tracking flow for PaidSoon invoices.
---

# Build Promise-to-Pay Flow — PaidSoon

## Role
You are a senior full-stack engineer implementing a promise-to-pay tracking feature for PaidSoon.

## Goal
Allow PaidSoon users to record when a debtor promises to pay by a specific date, pause automated follow-ups until that date passes, and resume if payment is not received.

> **Important:** This feature is **not currently implemented**. Build it from scratch following PaidSoon conventions.

## PaidSoon Context
PaidSoon tracks invoices via `TrackedInvoice`. Current statuses: `pending`, `paused`, `snoozed`, `manually_resolved`, `paid`, `sequence_complete`. A promise-to-pay is conceptually similar to a snooze but includes a recorded commitment date and optional debtor name.

## Files to Inspect
- `prisma/schema.prisma` — `TrackedInvoice` model (existing status field)
- `prisma/rls-policies.sql` — existing RLS policies (pattern to follow)
- `app/api/invoices/[id]/snooze/route.ts` — closest existing pattern
- `app/api/invoices/[id]/pause/route.ts` — pause pattern
- `components/dashboard/InvoiceTable.tsx` — where action buttons live
- `lib/billing.ts` — `requireFeature` pattern for gating
- `lib/subscriptionPlans.ts` — check if a feature flag is needed

## Schema Changes Required

Add to `TrackedInvoice` in `prisma/schema.prisma`:
- `promisedPaymentDate DateTime?` — the date the debtor promised to pay
- `promisedPaymentNote String?` — optional note (e.g., "Debtor confirmed via email")

Or consider a separate `PromiseToPay` table if you want history — document your choice.

## Implementation Rules

### New API Route
Create: `POST /api/invoices/[id]/promise`
- Authenticate via `supabase.auth.getUser()`
- Validate body: `{ promisedDate: string (ISO date), note?: string }`
- Use `withUserContext(userId, fn)` for all DB operations
- Set `status = "snoozed"`, `snoozedUntil = promisedDate`, and store promise fields
- Return the updated invoice

### Cron Behaviour
- The existing cron job already resumes snoozed invoices when `snoozedUntil <= now`
- After promise date passes without payment, the invoice returns to `pending` and the next stage email fires
- No cron changes needed unless you add a separate reminder when promise date approaches

### UI
- Add a "Promise to Pay" button to `InvoiceTable.tsx` alongside pause/snooze/resolve
- Show the promised date in the invoice row
- Add a modal or inline form for capturing the date and optional note

### RLS
- If a new table is added, add RLS policies to `prisma/rls-policies.sql`
- Run `npm run verify-rls` after migration

### Tests
- Test that setting a promise pauses the email sequence
- Test that expiry of `snoozedUntil` resumes the invoice on next cron run
- Stub DB and email dependencies

## Expected Output

1. Schema migration (if fields added)
2. Updated `prisma/rls-policies.sql` (if table added)
3. `POST /api/invoices/[id]/promise` route
4. UI updates in `InvoiceTable.tsx`
5. Tests in `tests/`
6. `docs/DDD.md` update

## Acceptance Criteria
- Promise date captured and stored correctly
- Invoice status becomes `snoozed` after promise is recorded
- Invoice auto-resumes on cron run after promise date
- `npm run test` passes
- No TypeScript errors
