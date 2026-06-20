---
mode: agent
description: Add or fix an RLS policy in PaidSoon.
---

# Add RLS Policy — PaidSoon

## Role
You are a database security engineer adding or fixing a Row Level Security policy in PaidSoon.

## Goal
Write, review, or fix an RLS policy in `prisma/rls-policies.sql` and verify it correctly isolates tenant data.

## PaidSoon Context
RLS is enforced via `withUserContext(userId, fn)` which runs:
```sql
SELECT set_config('request.jwt.claims', '{"sub": "<userId>", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
```
Inside this transaction, `auth.uid()` returns `userId` (text). Policies check `auth.uid()::text = "userId"`.

## Files to Inspect
- `prisma/rls-policies.sql` — all existing policies
- `prisma/schema.prisma` — table structure, field names
- `lib/db/withUserContext.ts` — how user context is established
- `scripts/verify-rls.ts` — integration test

## RLS Policy Patterns

### Standard user-scoped table
```sql
ALTER TABLE "table_name" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can select own table_name"
  ON "table_name" FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own table_name"
  ON "table_name" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own table_name"
  ON "table_name" FOR UPDATE
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");
```

### Table with indirect ownership (e.g., `email_logs` via `tracked_invoices`)
```sql
CREATE POLICY "users can select own email_logs"
  ON "email_logs" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "tracked_invoices" ti
      WHERE ti.id = "email_logs"."trackedInvoiceId"
        AND auth.uid()::text = ti."userId"
    )
  );
```

## Rules
- Always use `auth.uid()::text` (text cast) — `userId` is stored as text, not UUID
- Use `USING` for SELECT/UPDATE/DELETE; `WITH CHECK` for INSERT/UPDATE
- Never use `SECURITY DEFINER` functions to bypass RLS
- Never set `FORCE ROW LEVEL SECURITY` unless required for superuser connections
- Do not grant `BYPASSRLS` to the runtime role

## Testing the Policy
After adding the policy, run:
```bash
npm run verify-rls
```

If `verify-rls` does not cover the new table, extend `scripts/verify-rls.ts` to test it.

## Debugging Policy Issues

If data is unexpectedly hidden:
1. Confirm `withUserContext` is being used (not raw Prisma)
2. Confirm `SET LOCAL ROLE authenticated` is executing correctly
3. Check `auth.uid()::text` matches the stored `userId` format
4. Run: `SELECT current_setting('request.jwt.claims', true)` inside the transaction

## Expected Output
1. Exact SQL for the new/fixed policy
2. Updated `prisma/rls-policies.sql`
3. Confirmation that `npm run verify-rls` passes

## Acceptance Criteria
- Policy uses `auth.uid()::text` pattern
- All operations (SELECT/INSERT/UPDATE/DELETE) covered as needed
- `npm run verify-rls` passes
- No cross-user data accessible via `withUserContext`
