# Skill: Supabase RLS — PaidSoon

## When to Use This Skill
Use when writing, reviewing, or debugging Row Level Security policies in PaidSoon, or when verifying tenant data isolation.

## Status
Confirmed implemented in this codebase (all 6 tables have RLS enabled).

## Inputs Required
- Table name to add/review policies for
- Operations needed (SELECT, INSERT, UPDATE, DELETE)
- Whether the table has direct `userId` field or indirect ownership

## Files to Inspect
- `prisma/rls-policies.sql` — all existing policies (canonical)
- `prisma/schema.prisma` — table structure and field names
- `lib/db/withUserContext.ts` — how user context is set
- `scripts/verify-rls.ts` — integration test
- `prisma/migrations/` — migration SQL

## How RLS Works in PaidSoon

The user context is set inside each `withUserContext` transaction:
```sql
SELECT set_config('request.jwt.claims', '{"sub": "<userId>", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
```
After this, `auth.uid()` returns the `userId` (text) for the duration of the transaction.

## Standard Policy Pattern

```sql
-- Enable RLS
ALTER TABLE "table_name" ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "users can select own table_name"
  ON "table_name" FOR SELECT
  USING (auth.uid()::text = "userId");

-- INSERT
CREATE POLICY "users can insert own table_name"
  ON "table_name" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

-- UPDATE
CREATE POLICY "users can update own table_name"
  ON "table_name" FOR UPDATE
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");
```

## Indirect Ownership Pattern (email_logs)

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

## DB Tables and RLS Status

| Table | Has RLS | Pattern |
|---|---|---|
| `user_profiles` | ✅ | Direct userId |
| `invoice_connections` | ✅ | Direct userId |
| `schedules` | ✅ | Direct userId |
| `email_settings` | ✅ | Direct userId |
| `tracked_invoices` | ✅ | Direct userId |
| `email_logs` | ✅ | Via tracked_invoices join |

## Rules to Follow
- Always use `auth.uid()::text` (text cast) — `userId` is stored as text
- `USING` clause for SELECT/UPDATE/DELETE
- `WITH CHECK` clause for INSERT/UPDATE
- Never disable RLS on user-scoped tables
- Never grant `BYPASSRLS` to the runtime database role

## Testing RLS
```bash
npm run verify-rls
```
Must pass after any schema or policy change.

## Common Mistakes to Avoid
- Forgetting `::text` cast on `auth.uid()` (it returns uuid by default)
- Missing `WITH CHECK` on INSERT policies
- Using `prismaAdmin` in user-facing code (bypasses RLS)
- Not running `verify-rls` after migration
- Setting policies on the wrong table name (check `@@map` in schema)

## Output Format
- SQL policy statements in standard PaidSoon format
- Updated `prisma/rls-policies.sql`
- Confirmation that `npm run verify-rls` passes

## Acceptance Checklist
- [ ] `auth.uid()::text` pattern used
- [ ] SELECT, INSERT, UPDATE policies present (DELETE if needed)
- [ ] Policy names follow convention: `"users can <op> own <table>"`
- [ ] `npm run verify-rls` passes
- [ ] No cross-user data accessible
