---
mode: agent
description: Add a new Supabase/Prisma table to PaidSoon with correct RLS policies.
---

# Add Supabase Table — PaidSoon

## Role
You are a database engineer adding a new table to the PaidSoon Supabase Postgres database via Prisma.

## Goal
Add a new table (model) to `prisma/schema.prisma`, generate the migration, add correct RLS policies, and verify tenant isolation.

## PaidSoon Context
Prisma 7.8.0 with `@prisma/adapter-pg`. Database is Supabase Postgres. RLS is enforced via `withUserContext` which sets `auth.uid()` inside the transaction.

## Files to Inspect
- `prisma/schema.prisma` — existing models and patterns
- `prisma/rls-policies.sql` — existing RLS policies (pattern to follow)
- `lib/db/withUserContext.ts` — how RLS is activated
- `scripts/verify-rls.ts` — integration test to update
- `docs/DDD.md` — where to document the new table

## Step-by-Step Process

### 1. Define the Model
Add to `prisma/schema.prisma`:
```prisma
model NewTable {
  id        String   @id @default(cuid())
  userId    String   // FK to Supabase auth.users.id
  // ... other fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("new_table_snake_case")
}
```

Rules:
- Use `String @id @default(cuid())` for primary keys
- `userId String` for per-user tables
- Add `@@index([userId])` for query performance
- Use `@@map("snake_case_name")` for the DB table name

### 2. Generate Migration
```bash
npx prisma migrate dev --name add-new-table
```
Review the generated SQL before proceeding.

### 3. Add RLS Policies
Add to `prisma/rls-policies.sql`:
```sql
-- new_table_snake_case
ALTER TABLE "new_table_snake_case" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can select own new_table_snake_case"
  ON "new_table_snake_case" FOR SELECT
  USING (auth.uid()::text = "userId");

CREATE POLICY "users can insert own new_table_snake_case"
  ON "new_table_snake_case" FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "users can update own new_table_snake_case"
  ON "new_table_snake_case" FOR UPDATE
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");
```

Add a DELETE policy only if users can delete rows.

### 4. Apply Policies
Apply policies through the canonical child-process wrapper:
```bash
npm run db:apply-rls
```

### 5. Verify Isolation
```bash
npm run verify-rls
```

### 6. Update Documentation
- Add the table to `docs/DDD.md` (database model section)
- Describe purpose, fields, and access control

## Implementation Rules
- Never edit `prisma/migrations/` files directly
- Never add a table without RLS policies
- Canonical adapters select session mode for migrations and transaction mode for runtime queries
- Never use `prismaAdmin` in user-facing code to query the new table
- Always run `verify-rls` after schema changes

## Expected Output
1. Updated `prisma/schema.prisma`
2. Generated migration SQL preview
3. Updated `prisma/rls-policies.sql`
4. `docs/DDD.md` update
5. Confirm `npm run verify-rls` result

## Acceptance Criteria
- Table created with correct Prisma model
- RLS enabled with at least SELECT and INSERT policies
- `npm run verify-rls` passes
- `npm run build` passes (no type errors)
