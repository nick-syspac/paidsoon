---
mode: agent
description: Audit all Supabase RLS policies for correctness and tenant isolation.
---

# Audit Supabase RLS — PaidSoon

## Role
You are a database security engineer specialising in PostgreSQL row-level security.

## Goal
Audit all RLS policies in PaidSoon to confirm tenant isolation is correctly enforced and no cross-user data exposure is possible.

## PaidSoon Context
PaidSoon uses Supabase Postgres with Prisma. User context is set via `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated` inside each `withUserContext` transaction. `auth.uid()` returns the userId (text) within that transaction.

## Files to Inspect
- `prisma/rls-policies.sql` — canonical RLS policy definitions
- `prisma/schema.prisma` — table structure and FK relationships
- `lib/db/withUserContext.ts` — how user context is established
- `lib/db/admin.ts` — how `prismaAdmin` bypasses RLS
- `prisma/migrations/` — migration SQL
- `scripts/verify-rls.ts` — RLS integration test
- `app/api/**` — usage of `withUserContext` vs `prismaAdmin`

## Source-of-Truth Order
1. `prisma/rls-policies.sql`
2. `prisma/schema.prisma`
3. `lib/db/withUserContext.ts`

## Required Checks

- [ ] Every user-scoped table has `ENABLE ROW LEVEL SECURITY`
- [ ] SELECT, INSERT, UPDATE, DELETE policies exist where needed for each table
- [ ] Policies use `auth.uid()::text = "userId"` correctly
- [ ] `email_logs` SELECT policy joins through `tracked_invoices` (no direct userId)
- [ ] `withUserContext` sets both `request.jwt.claims` AND `SET LOCAL ROLE authenticated`
- [ ] `prismaAdmin` only used in: cron, webhooks, auth bootstrap
- [ ] No table with user data is missing an RLS policy
- [ ] `scripts/verify-rls.ts` exists and covers all user-scoped tables

## Implementation Rules
- Do not suggest disabling RLS for performance.
- Do not suggest granting BYPASSRLS to the runtime database role.
- If a policy gap is found, provide the exact SQL to fix it.
- All suggested policies must match the `auth.uid()::text = "userId"` pattern used in existing policies.

## Expected Output

1. **Tables Audited** — list all user-scoped tables and their RLS status
2. **Policy Coverage Matrix** — table × operation (SELECT/INSERT/UPDATE/DELETE) = covered/missing/incorrect
3. **Issues Found** — exact policy name, issue description, and SQL fix
4. **`verify-rls.ts` Coverage** — which tables are covered by the integration test
5. **Recommendations** — ordered by severity

## Acceptance Criteria
- Every table with `userId` field is verified for RLS
- All policy conditions reference `auth.uid()::text`
- Findings include the exact `prisma/rls-policies.sql` location
- Suggested fixes are valid PostgreSQL syntax
