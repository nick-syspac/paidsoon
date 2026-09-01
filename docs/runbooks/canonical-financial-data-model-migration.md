# Runbook — Canonical Financial Data Model Migration

Applies the `canonical-financial-data-model` change
([openspec change](../../openspec/changes/canonical-financial-data-model/design.md)):
introduces the canonical financial layer (`financial_contacts`, `financial_invoices`,
`financial_payments`), narrows `tracked_invoices` to chasing-workflow state, reshapes
`customers` over canonical contacts, retires the provider mapping tables, and aligns the
SpendLeak foundation tables to the shared provenance vocabulary.

> **⚠ DESTRUCTIVE — DEV/PREVIEW ONLY. NEVER PRODUCTION.**
> This migration is destructive **by design** (design D1): it drops invoice-fact columns
> from `tracked_invoices`, drops `provider_invoice_mappings` / `provider_contact_mappings`,
> and deletes existing `customers` rows (no identity backfill). It is only safe because
> there are zero production customers. **Do not run it against `paidsoon-prod`.** Dev and
> preview data are disposable — they are re-seeded afterwards (step 6).

## When to run this

Run once, after the change's code is merged/ready, against the **dev** database
(`paidsoon-dev`), then re-apply to **preview** when promoting. Do **not** run against
production until a separate, customer-safe migration path is designed (out of scope here).

## Preconditions

- The change's code is on your branch (canonical schema already in `prisma/schema.prisma`).
- Migration SQL reviewed: `prisma/migrations/20260831000000_canonical_financial_data_model/migration.sql`.
  It was **hand-authored** (no local Postgres/Docker was available for Prisma's shadow-DB
  generation), so a human read-through is required before applying.
- You have the `paidsoon-dev` database password (Supabase dashboard → Project Settings →
  Database, or the team secret store).

## Step 0 — Point `.env.local` at the DEV project (currently production)

**This is the safety gate.** The migration URL is derived from `SUPABASE_PROJECT_REF` +
`SUPABASE_DB_PASSWORD` by `lib/config/supabaseEnvironmentRuntime.ts` (used by
`prisma.config.ts`). If those still point at `paidsoon-prod`, `prisma migrate` will run
against production.

Per the [env-var matrix](./README.md#environment-variable-matrix), local must use the dev
project:

| Env var | Local value (dev) |
|---|---|
| `SUPABASE_PROJECT_REF` | `paidsoon-dev` project ref |
| `SUPABASE_DB_PASSWORD` | `paidsoon-dev` database password |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `paidsoon-dev` `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | `paidsoon-dev` `sb_secret_…` |

**Confirm the target before proceeding** (prints the project ref only — never the password):

```bash
grep '^SUPABASE_PROJECT_REF=' .env.local
```

Expected: the **`paidsoon-dev`** ref. If it shows the `paidsoon-prod` ref, **stop** and fix
`.env.local` first. Do not continue until it shows dev.

## Step 1 — Regenerate the client (already done in the change, but harmless to re-run)

```bash
PRISMA_GENERATE_ONLY=true npx prisma generate
```

## Step 2 — Review then apply the migration to DEV

Review the SQL once more, then apply:

```bash
# Review
cat prisma/migrations/20260831000000_canonical_financial_data_model/migration.sql

# Apply against the (dev) database and mark it recorded
npx prisma migrate dev --name canonical_financial_data_model
```

Notes:
- `prisma migrate dev` will detect the existing migration directory and apply it. If it
  instead offers to *create* a new migration because the recorded state has drifted, stop and
  reconcile with `npx prisma migrate status` first.
- If your dev DB has rows Prisma flags as needing a reset (it is destructive), that is
  expected here — the dev schema is disposable. Accept the reset only if you have confirmed
  step 0 pointed at dev.

## Step 3 — Apply RLS policies

```bash
npm run db:apply-rls
```

If `db:apply-rls` fails with a `syntax error at or near "POLICY"` (the file uses
`CREATE OR REPLACE POLICY`, which Supabase Postgres 17.6 rejects), this is a known repo-wide
quirk — apply the new canonical-table policies directly using standard
`DROP POLICY IF EXISTS …; CREATE POLICY …` syntax, and leave the committed file's convention
unchanged. (See repo memory note on `rls-policies.sql`.)

## Step 4 — Verify RLS isolation on the canonical tables

```bash
npm run verify-rls
```

Expect `PASS: RLS is enforced.` — this now exercises the canonical contacts/invoices and the
customer→contact join in addition to the existing checks.

## Step 5 — Re-point the four DB-touching scripts

These scripts still reference dropped columns and must be updated to the canonical shape
before they run (they were intentionally left for post-migration):

- `scripts/seed-preview.ts`
- `scripts/verify-seed.ts`
- `scripts/backfill-customer-entities.ts`
- `scripts/reset-myob-connection.ts`

(Track under change task 4.4.) If you only need a clean dataset, `db:seed:reset` +
`db:seed` (step 6) is the priority; the backfill/reset-myob scripts are lower priority.

## Step 6 — Re-seed the dev database

```bash
npm run db:seed:reset   # clear prior seed-owned rows
npm run db:seed         # re-seed against the new canonical schema
```

## Step 7 — Smoke-test the chasing loop end to end

With `npm run dev` running against dev, verify (change task 4.4):

1. Connect a Xero/MYOB sandbox org (or import a CSV).
2. Sync → invoices appear on the dashboard with correct client/amount/due data.
3. Trigger a reminder (or let cron/the internal send-reminder job run) → email logged.
4. Submit a promise-to-pay via a `p2pToken` link → chasing pauses.
5. Record a payment / mark paid → status flips, outstanding zeroes.

## Step 8 — Promote to preview

Once dev is green, apply the same migration + RLS + re-seed against the preview database
(the preview deploy targets `paidsoon-dev` per the matrix, so this is the same project —
confirm before assuming a separate preview DB exists). Update Vercel preview env if needed.

## Rollback

There is no clean rollback — the migration is destructive and one-way by design. Recovery is
re-seeding (step 6). This is acceptable only because the target has no production customers.
If this ever needs to run where real data exists, **stop and design a data-migration path
first** (out of scope for this change).

## Reference

- Change: [openspec/changes/canonical-financial-data-model](../../openspec/changes/canonical-financial-data-model/)
- Design decisions D1–D7: [design.md](../../openspec/changes/canonical-financial-data-model/design.md)
- Env values: [env-var matrix](./README.md#environment-variable-matrix)
- Supabase setup: [supabase.md](./supabase.md)
