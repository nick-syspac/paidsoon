# Skill: Supabase Migrations — PaidSoon

## When to Use This Skill
Use when adding, modifying, or rolling back database schema changes in PaidSoon.

## Status
Confirmed implemented (Prisma 7.8.0 migrations, one existing migration: `20260531101711_init`).

## Inputs Required
- Description of the schema change needed
- Which table(s) are affected
- Whether RLS policies need updating

## Files to Inspect
- `prisma/schema.prisma` — source of truth for schema
- `prisma/rls-policies.sql` — RLS policies to update
- `prisma/migrations/` — migration history
- `prisma.config.ts` — Prisma configuration
- `docs/DDD.md` — to update after schema change

## Migration Workflow

### 1. Edit the schema
Modify `prisma/schema.prisma` — add model, field, index, or relation.

### 2. Generate the migration
```bash
npx prisma migrate dev --name <descriptive-name>
```
Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`.

### 3. Update RLS policies
If a new table was added, add policies to `prisma/rls-policies.sql`. If columns changed, check if policies need updating.

### 4. Apply policies
```bash
psql $DIRECT_URL -f prisma/rls-policies.sql
```

### 5. Verify RLS
```bash
npm run verify-rls
```

### 6. Regenerate Prisma client
```bash
npx prisma generate
```
(Or run `npm run build` which includes `prisma generate`.)

### 7. Update documentation
Update `docs/DDD.md` with the schema change.

## Schema Conventions

```prisma
model NewModel {
  id        String   @id @default(cuid())
  userId    String                           // Required for user-scoped tables
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("new_model_snake_case")              // DB table name in snake_case
}
```

- IDs: `String @id @default(cuid())`
- Monetary amounts: `Int` (cents)
- Dates: `DateTime`
- Optional fields: `String?`, `Int?`

## Production Migration

```bash
# In CI/CD only — never locally against production DB
npx prisma migrate deploy
```

**Never** run `npx prisma migrate dev` in production.

## Rollback

Prisma does not support automatic rollbacks. To roll back:
1. Write a new migration that reverses the change
2. Apply it the same way

## Rules to Follow
- Never edit `prisma/migrations/` files directly
- `DATABASE_URL` = pooled connection (runtime)
- `DIRECT_URL` = direct connection (migrations only)
- Always update `prisma/rls-policies.sql` after adding tables
- Always run `verify-rls` after schema changes

## Common Mistakes to Avoid
- Running `migrate dev` against production DB
- Forgetting to update RLS policies after adding a table
- Forgetting to run `prisma generate` after schema changes
- Using `DIRECT_URL` as `DATABASE_URL` at runtime

## Output Format
- Updated `prisma/schema.prisma`
- Generated migration SQL (preview before applying)
- Updated `prisma/rls-policies.sql`
- `docs/DDD.md` update

## Acceptance Checklist
- [ ] Migration generated with `migrate dev`
- [ ] RLS policies added for new tables
- [ ] `npm run verify-rls` passes
- [ ] `npm run build` passes
- [ ] `docs/DDD.md` updated
