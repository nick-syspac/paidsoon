---
mode: agent
description: Diagnose and fix a Supabase or database issue in PaidSoon.
---

# Fix Supabase Issue — PaidSoon

## Role
You are a database engineer diagnosing and fixing a Supabase or Prisma issue in PaidSoon.

## Goal
Identify and fix a database, RLS, auth, or Prisma issue in PaidSoon.

## PaidSoon Context
Prisma 7.8.0 with `@prisma/adapter-pg`. Supabase Postgres. RLS via `withUserContext`. Auth via Supabase Auth. Two DB access patterns: `withUserContext` (user-facing) and `prismaAdmin` (system).

## Files to Inspect
- `prisma/schema.prisma` — data model
- `prisma/rls-policies.sql` — RLS policies
- `lib/db/withUserContext.ts` — user context setup
- `lib/db/admin.ts` — prismaAdmin
- `lib/supabase/server.ts` — server auth client
- `lib/supabase/client.ts` — browser auth client
- `scripts/verify-rls.ts` — RLS integration test
- `prisma.config.ts` — Prisma config

## Diagnostic Checklist

### RLS Issues (empty results / unexpected data)
- [ ] Is `withUserContext(userId, fn)` used for the query? (not raw prisma)
- [ ] Does the query use `userId` matching `auth.uid()::text`?
- [ ] Is `SET LOCAL ROLE authenticated` executing in the transaction?
- [ ] Is the `userId` passed to `withUserContext` correctly derived from `supabase.auth.getUser()`?
- [ ] Are RLS policies present and correct in `prisma/rls-policies.sql`?
- [ ] Run: `npm run verify-rls` to check isolation

### Auth Issues
- [ ] Is the browser client used where the server client is needed?
- [ ] Is `getSession()` used instead of `getUser()`?
- [ ] Are cookies being set/read correctly via `@supabase/ssr`?

### Prisma / Migration Issues
- [ ] Does `prisma/schema.prisma` match the live DB schema?
- [ ] Was `npx prisma migrate deploy` run after the last migration?
- [ ] Is `DATABASE_URL` pointing to the correct DB (pooler for runtime)?
- [ ] Is `DIRECT_URL` used for migrations only (not runtime)?
- [ ] Was `prisma generate` run after schema changes? (`npm run build` includes this)

### Connection Issues
- [ ] Is `DATABASE_URL` the pgBouncer pooled URL (not direct)?
- [ ] Is `DIRECT_URL` the direct non-pooled URL (for migrations only)?
- [ ] Are connection pool limits being hit?

## Common Fixes

### "No rows returned" when data exists
Usually an RLS issue. Verify:
1. `withUserContext` is used
2. `userId` matches what's in the DB
3. RLS policy exists for the operation

### "Cannot read properties of undefined"
Usually the user is not authenticated. Check:
1. `supabase.auth.getUser()` returned a user
2. Route returns 401 if no user before DB query

### Prisma P2003 (foreign key constraint)
Check the FK relationship in `prisma/schema.prisma` and that the referenced record exists.

## Expected Output
1. Root cause description
2. File and line reference
3. Targeted fix
4. Confirmation `npm run verify-rls` passes (if RLS-related)

## Acceptance Criteria
- Issue resolved
- RLS still enforced
- `npm run verify-rls` passes (if schema or policy changed)
- `npm run build` passes
