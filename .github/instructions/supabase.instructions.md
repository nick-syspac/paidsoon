---
applyTo: "**/prisma/**,**/lib/db/**,**/lib/supabase/**,**/scripts/verify-rls*"
---

# Supabase Instructions — PaidSoon

## Schema Migration Rules

- The canonical schema is `prisma/schema.prisma`. Never edit migration files directly.
- To make a schema change:
  1. Edit `prisma/schema.prisma`
  2. Run `npx prisma migrate dev --name <descriptive-name>` locally
  3. Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`
  4. Update `prisma/rls-policies.sql` with matching RLS policies for any new tables/columns
  5. Run `npm run verify-rls` to confirm isolation holds
- Run `npm run prisma:migrate:deploy` in CI/CD. Never run `migrate dev` in production.
- Configure `SUPABASE_PROJECT_REF` and server-only `SUPABASE_DB_PASSWORD`; adapters derive transaction-mode runtime and session-mode migration URLs.

## Database Access Pattern

Two explicit, documented entry points — **no default `prisma` export**:

### `withUserContext(userId, fn)` — User-facing code
- File: `lib/db/withUserContext.ts`
- Opens a Prisma transaction and runs:
  ```sql
  SELECT set_config('request.jwt.claims', '{"sub": "<userId>", "role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ```
- Makes `auth.uid()` resolve to `userId`, activating RLS policies.
- Required for: all API route handlers, server components reading user data, server actions.

### `prismaAdmin` — System/service code only
- File: `lib/db/admin.ts`
- Uses the derived transaction-pooler URL with an owner-level role that bypasses RLS.
- Allowed only in:
  - `app/api/cron/send-emails/route.ts`
  - `app/api/webhooks/stripe-billing/route.ts`
  - `app/api/webhooks/stripe-connect/route.ts`
  - `lib/actions/auth.ts` (post-signup bootstrap)
- Any use outside these files **must include a code comment** explaining why.

## RLS Policy Rules

- Every table has RLS enabled. Policies are documented in `prisma/rls-policies.sql`.
- The user context is established via `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`.
- `auth.uid()` returns `userId` (text) within a `withUserContext` transaction.
- `email_logs` SELECT policy joins through `tracked_invoices` so users only see their own logs.
- Cron job and webhook handlers use `prismaAdmin` which bypasses RLS — this is intentional.

## How to Add a New Table

1. Add the model to `prisma/schema.prisma`.
2. Decide if it is user-scoped (has `userId TEXT` FK) or system-scoped.
3. Run `npx prisma migrate dev --name add-<table-name>`.
4. Add RLS policies to `prisma/rls-policies.sql`:
   - `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
   - `CREATE POLICY "users can select own <table>" ON <table> FOR SELECT USING (auth.uid()::text = "userId");`
   - Repeat for INSERT, UPDATE, DELETE as appropriate.
5. Run `npm run verify-rls`.
6. Update `docs/DDD.md` to document the new table.

## How to Test RLS Policies

- Use the script at `scripts/verify-rls.ts` (`npm run verify-rls`).
- It seeds two users, inserts records for each, and asserts cross-user queries return no rows.
- Run this after every migration or RLS policy change.
- Requires a live Supabase DB — do not run in unit-test mode.

## Auth Rules

- Auth provider: Supabase Auth (email/password + Google OAuth).
- Browser client: `createClient()` from `lib/supabase/client.ts` — uses the compile-time derived public URL + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server client: `createClient()` from `lib/supabase/server.ts` — reads cookies; **only for server components and route handlers**.
- Always call `supabase.auth.getUser()` for server-side identity. Never use `getSession()` — it can be spoofed.
- After sign-out, users go to `/` (not `/sign-in`).
- OAuth callback route: `app/auth/callback/route.ts` — exchanges code for session via `exchangeCodeForSession`.

## Storage Rules

- Supabase Storage is **not currently used** in PaidSoon.
- Do not add storage buckets without documenting the rationale in `docs/DDD.md`.

## Supabase Edge Functions

- Supabase Edge Functions are **not currently used** in PaidSoon.
- Background/cron jobs are handled via Vercel Cron → `app/api/cron/send-emails/route.ts`.

## Local Development

- Use `.env.local` for local environment variables. Never commit this file.
- `SUPABASE_PROJECT_REF` must be the lowercase 20-character project identifier.
- `SUPABASE_DB_PASSWORD` is server-only and must come from the approved secret store.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the anon/public key.
- Set optional `SUPABASE_DB_POOLER_HOST` only when the Connect panel differs from the checked-in default.
- Never configure or construct `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, or `DIRECT_URL` outside the authoritative adapters.
- Run `npx prisma db push` for schema prototyping; use `migrate dev` for tracked migrations.

## Cross-Tenant Data Exposure Prevention

- RLS is the primary tenant isolation mechanism. Never disable or bypass it in user-facing code.
- `withUserContext` is the only way to query user-scoped data in route handlers.
- Never accept `userId` from client-controlled request data — always derive from `supabase.auth.getUser()`.
- In Prisma queries within `withUserContext`, you may additionally filter by `userId` for defence-in-depth, but this is not a substitute for RLS.
