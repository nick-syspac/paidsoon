# PaidSoon — Environment Promotion Guide

This document describes the full lifecycle for developing, testing, and deploying PaidSoon:
from a local developer machine through to the production environment.

> **Canonical env-var values** live in [docs/runbooks/README.md](./runbooks/README.md). This
> document describes the promotion *workflow*; the runbooks describe the service-level *setup*.

---

## Environment model

PaidSoon runs across three logical environments:

| Environment | Hosted on | Supabase project | Stripe mode | Email sender |
|---|---|---|---|---|
| **Local** | `npm run dev` on your machine | `paidsoon-dev` | test | `onboarding@resend.dev` |
| **Preview** | Vercel Preview (every PR/branch) | `paidsoon-dev` (shared) | test | `onboarding@resend.dev` |
| **Production** | Vercel Production (`paidsoon.com`) | `paidsoon-prod` | live | `billing@paidsoon.com` |

Key design decisions:

- **Local and Preview share `paidsoon-dev`.** There is no per-PR Supabase project. Preview
  deployments are UI-level checks against the shared development database. This keeps
  operational overhead low for a solo operator.
- **Production is completely isolated.** `paidsoon-prod` is a separate Supabase project,
  with separate credentials, separate Stripe live-mode keys, and a separate verified email
  domain. No preview tooling can touch it.
- **Cron runs in Production only.** Vercel does not schedule cron jobs on preview deployments.
  Test the email-sending path manually using `curl` (see [vercel.md §6](./runbooks/vercel.md)).

---

## Git branching strategy

PaidSoon uses a two-branch model:

```
feature/*  ─────┐
                ├─→ Vercel Preview  (paidsoon-dev Supabase, Stripe test)
develop    ─────┘

main       ─────────→ Vercel Production  (paidsoon-prod Supabase, Stripe live)
```

### Day-to-day flow

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/my-change
   ```

2. Develop locally (`npm run dev`). Run tests:
   ```bash
   npm test
   npm run verify-rls   # after any schema change
   ```

3. Push and open a pull request against `develop`. Vercel auto-deploys a preview.

4. Smoke-test the preview URL. Seed it if needed (see [Seeding preview](#seeding-preview)
   below).

5. Merge to `develop` → preview deployment updates.

6. When ready for production, open a PR from `develop` → `main`. Verify once more.

7. Merge to `main` → Vercel auto-deploys to production.

### One-liner promotion

```
Local → feature branch → PR → Vercel Preview → develop → PR → main → Vercel Production
```

---

## Local development setup

### Prerequisites

- Node 20+
- npm
- A Supabase account with the `paidsoon-dev` project created

### First-time setup

1. **Clone the repo** and install dependencies:
   ```bash
   git clone <repo>
   cd paidsoon
   npm install
   ```

2. **Copy the local env example**:
   ```bash
   cp .env.local.example .env.local
   # Fill in the values — see docs/runbooks/supabase.md for Supabase URLs/keys
   ```

3. **Apply database migrations** against `paidsoon-dev`:
   ```bash
   # DIRECT_URL must point at paidsoon-dev
   npx prisma migrate deploy
   ```

4. **Apply RLS policies**:
   ```bash
   psql "$DIRECT_URL" -f prisma/rls-policies.sql
   ```

5. **Verify RLS**:
   ```bash
   npm run verify-rls
   ```

6. **Seed test data** (optional, recommended for UI testing):
   ```bash
   npm run seed:local
   npm run verify-seed
   ```

7. **Start the dev server**:
   ```bash
   npm run dev
   ```

The app is now at `http://localhost:3000`.

### Useful local scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js in dev mode |
| `npm test` | Run the test suite |
| `npm run verify-rls` | Verify RLS tenant isolation against the dev DB |
| `npm run seed:local` | Seed the local dev DB with test data |
| `npm run verify-seed` | Verify seed data is correct and complete |
| `npm run db:reset:local` | **Destructive** — drop and rebuild the local DB from migrations |

---

## Preview (Vercel) setup

Preview deployments happen automatically when you push a branch or PR.

### What "preview" means

- Vercel builds and deploys every pushed branch.
- The deploy uses the same `paidsoon-dev` Supabase project as local.
- Stripe is in test mode — no real charges.
- Email is sent via `onboarding@resend.dev` (sandbox — no real recipients).
- The cron job does NOT fire automatically. Trigger it manually if you want to test
  the email-sending path.

### Environment variables on Vercel (Preview)

Set in **Vercel → Project → Settings → Environment Variables**, target: **Preview**.

See [.env.preview.example](./../.env.preview.example) for the complete variable list
with expected values.

Critical rule: `DATABASE_URL` and `SUPABASE_SECRET_KEY` for Preview must point at
`paidsoon-dev`, NOT `paidsoon-prod`.

### Seeding preview

Preview deployments share `paidsoon-dev` with your local machine. To seed (or re-seed)
test data from your local machine:

```bash
npm run seed:preview   # SEED_ENV=preview, DATABASE_URL from .env.local
npm run verify-seed
```

The script targets whatever `DATABASE_URL` is in your `.env.local`. Since both `seed:local`
and `seed:preview` point at `paidsoon-dev`, the only difference is the `SEED_ENV` value
(useful for audit logs and CI output).

> **Safety**: The seed script refuses to run if `SEED_ENV` is `production`, `prod`,
> unset, or unknown. It also checks `DATABASE_URL` for production project identifiers.
> See [docs/preview-seed-data.md](./preview-seed-data.md) for the full safety spec.

### Preview email safety

All seed data uses fake `.test` domains (e.g. `goodpayer-preview.test`,
`demo-customer.test`). `RESEND_FROM_EMAIL` on preview is `onboarding@resend.dev` —
Resend's sandbox sender. No real customer email addresses are ever used in preview or
local environments.

---

## Production deployment

### What triggers a production deploy

Merging to `main` triggers an automatic Vercel production deploy. There is no manual
deploy step required.

### Environment variables on Vercel (Production)

Set in **Vercel → Project → Settings → Environment Variables**, target: **Production**.

See [.env.production.example](./../.env.production.example) for the complete variable list
with expected values.

Critical differences from Preview:

| Variable | Preview | Production |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `paidsoon-dev` | `paidsoon-prod` |
| `DATABASE_URL` | `paidsoon-dev` pooler | `paidsoon-prod` pooler |
| `DIRECT_URL` | `paidsoon-dev` direct | `paidsoon-prod` direct |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_live_…` |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `billing@paidsoon.com` |
| `LIVE` | `false` | `true` |
| `CRON_SECRET` | not required | required |

### What production never receives

- Seed data — there is no seed script for production, and no `SEED_ENV` variable set.
- Test/preview database URLs — `DATABASE_URL` must point at `paidsoon-prod`.
- Stripe test keys — `STRIPE_SECRET_KEY` must be `sk_live_…`.
- The dev Resend API key or sandbox sender.

---

## Database migration workflow

PaidSoon uses **Prisma** for database migrations, not the Supabase CLI. All schema
changes are migration files committed to Git.

> Do not use Supabase Studio to edit the production schema directly. Schema changes
> must go through Git-committed migrations.

### Creating a new migration

```bash
# 1. Edit prisma/schema.prisma with your changes.

# 2. Generate a new migration file locally:
npx prisma migrate dev --name describe_your_change

# This creates prisma/migrations/<timestamp>_describe_your_change/migration.sql
# and applies it to your local paidsoon-dev database.

# 3. If RLS policies need updating, edit prisma/rls-policies.sql.

# 4. Re-apply RLS policies and verify:
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls

# 5. Commit everything together:
git add prisma/schema.prisma prisma/migrations/ prisma/rls-policies.sql
git commit -m "feat: add <column/table description>"
```

### Applying migrations to preview (paidsoon-dev)

The migration was already applied locally (step 2 above). If you want an explicit fresh
apply against the hosted `paidsoon-dev` project:

```bash
# Ensure DIRECT_URL points at paidsoon-dev
export DIRECT_URL="postgresql://postgres:DB_PASSWORD@db.your-dev-ref.supabase.co:5432/postgres"
npx prisma migrate deploy
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls
```

### Applying migrations to production (paidsoon-prod)

Only do this after the migration has been tested locally and on preview.

```bash
# Switch DIRECT_URL to paidsoon-prod
export DIRECT_URL="postgresql://postgres:DB_PASSWORD@db.your-prod-ref.supabase.co:5432/postgres"
npx prisma migrate deploy
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls
```

> Never run `prisma migrate dev` against production. Use `prisma migrate deploy` only.
> `migrate dev` can generate new migrations and modify the schema history; `migrate deploy`
> only applies pending migrations.

---

## Resetting the local database

If you need a completely clean local database (failed migration, conflicting data,
fresh start):

```bash
npm run db:reset:local
```

This runs `prisma migrate reset --force` against the `DIRECT_URL` in `.env.local`.
The script has two safety gates:

1. `SEED_ENV` must be `local` or `development` — it refuses `preview`, `production`,
   `prod`, unset, or unknown values.
2. `DIRECT_URL` must not contain production project identifiers (`paidsoon-prod`,
   `-prod.`, etc.).

After the reset, re-seed:

```bash
npm run seed:local
npm run verify-seed
```

---

## Safety guardrails summary

| Guard | Where enforced | What it blocks |
|---|---|---|
| `SEED_ENV` whitelist | `scripts/seed-preview.ts`, `scripts/db-reset-local.ts` | Seeding/resetting if env is production, preview, unset, or unknown |
| `DATABASE_URL` production marker scan | `scripts/seed-preview.ts` | Seeding if DATABASE_URL references `paidsoon-prod` |
| `DIRECT_URL` production marker scan | `scripts/db-reset-local.ts` | DB reset if DIRECT_URL references `paidsoon-prod` |
| Separate Supabase projects | Architecture | `paidsoon-dev` credentials cannot access `paidsoon-prod` data |
| Separate Vercel env targets | Vercel configuration | Preview builds cannot use Production Supabase/Stripe credentials |
| No `SEED_ENV` in Vercel env vars | Convention (documented) | No seed script can run from a Vercel deployment |

---

## ⚠ Critical warnings

```
NEVER point Vercel Preview DATABASE_URL at the production Supabase project.
NEVER run seed:preview or seed:local against a production database.
NEVER run db:reset:local against a production database.
NEVER edit the production schema directly in Supabase Studio.
NEVER commit Supabase service role keys (SUPABASE_SECRET_KEY) to any file.
NEVER use real customer email addresses in seed or test data.
NEVER set SEED_ENV=production or SEED_ENV=prod.
NEVER prefix SUPABASE_SECRET_KEY with NEXT_PUBLIC_ — it would be exposed to browsers.
ONLY promote code and database migrations, not data.
ONLY apply prisma migrate deploy to production after testing on preview.
```

---

## Common mistakes to avoid

| Mistake | Consequence | Prevention |
|---|---|---|
| Copying `DATABASE_URL` from prod to `.env.local` | Seed data written to production | Check URL contains `paidsoon-dev`, not `paidsoon-prod` |
| Setting `STRIPE_SECRET_KEY=sk_live_…` in preview | Live Stripe charges from test flows | Preview must always use `sk_test_…` |
| Running `prisma migrate dev` in production | May generate spurious new migrations | Use `prisma migrate deploy` in all hosted environments |
| Forgetting to re-apply `rls-policies.sql` after a migration | RLS may be incomplete or broken | Always run `npm run verify-rls` after `prisma migrate deploy` |
| Setting `LIVE=true` on preview before launch readiness | Sign-in/sign-up unintentionally exposed | Keep `LIVE=false` on preview until explicitly ready |
| Using `DIRECT_URL` as `DATABASE_URL` at runtime | Bypasses the pooler and is IPv6-only (unreachable from Vercel) | Runtime always uses the shared-pooler URL |

---

## See also

- [docs/runbooks/README.md](./runbooks/README.md) — canonical environment variable matrix
- [docs/runbooks/supabase.md](./runbooks/supabase.md) — Supabase project setup
- [docs/runbooks/vercel.md](./runbooks/vercel.md) — Vercel project setup
- [docs/runbooks/stripe.md](./runbooks/stripe.md) — Stripe setup (billing + Connect)
- [docs/runbooks/resend.md](./runbooks/resend.md) — Resend email setup
- [docs/preview-seed-data.md](./preview-seed-data.md) — seed data guide
- [docs/paidsoon-preview-seed-summary.md](./paidsoon-preview-seed-summary.md) — seed implementation summary
- [.env.local.example](../.env.local.example) — local env template
- [.env.preview.example](../.env.preview.example) — preview env template
- [.env.production.example](../.env.production.example) — production env template
