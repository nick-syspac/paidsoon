---
mode: agent
description: Diagnose and fix an API route or server-side issue in PaidSoon.
---

# Fix API Issue — PaidSoon

## Role
You are a senior full-stack engineer diagnosing and fixing an API route or server-side issue in PaidSoon.

## Goal
Identify the root cause of an API or server-side issue and implement a targeted, secure fix.

## PaidSoon Context
Next.js 16 App Router. API routes in `app/api/`. Auth via Supabase. DB via Prisma + `withUserContext`. Email via Resend. Billing via Stripe.

## Files to Inspect
- The specific route file mentioned in the issue
- `lib/supabase/server.ts` — server auth client
- `lib/db/withUserContext.ts` — user context DB access
- `lib/db/admin.ts` — prismaAdmin (for cron/webhook issues)
- `prisma/schema.prisma` — data model

## Diagnostic Checklist

### Auth Issues
- [ ] Is `supabase.auth.getUser()` called before any DB operation?
- [ ] Is `user.id` derived correctly from the auth result?
- [ ] Is `userId` being read from the request body instead of auth session?

### Database Issues
- [ ] Is `withUserContext` used for user-facing DB queries?
- [ ] Is `prismaAdmin` used outside of cron/webhooks/auth-bootstrap?
- [ ] Is a Prisma unique constraint violation causing an unhandled error?
- [ ] Is `amountDue` being stored/retrieved as cents (integer) consistently?

### Webhook Issues
- [ ] Is the Stripe webhook signature verified before processing?
- [ ] Is the raw request body read as bytes (not parsed JSON) for signature verification?
- [ ] Is the correct webhook secret used (`STRIPE_BILLING_WEBHOOK_SECRET` vs `STRIPE_CONNECT_WEBHOOK_SECRET`)?

### Cron Issues
- [ ] Is `Authorization: Bearer CRON_SECRET` verified?
- [ ] Are per-invoice errors caught individually so the full run doesn't abort?

### Response Issues
- [ ] Are raw DB rows returned (leaking internal fields)?
- [ ] Are error messages leaking stack traces or DB error strings?
- [ ] Is the correct HTTP status returned for each case?

## Fix Rules
- Make the minimum change needed to fix the issue
- Do not refactor unrelated code
- If the fix changes DB schema, follow the migration process
- Preserve all auth and RLS checks — never weaken security for convenience

## Expected Output
1. Root cause description
2. File and line reference
3. Targeted code fix
4. Confirmation no TypeScript errors after fix

## Acceptance Criteria
- Issue resolved
- Auth check preserved or restored
- RLS not bypassed
- No TypeScript errors: `npm run build`
- Relevant tests pass: `npm run test`
