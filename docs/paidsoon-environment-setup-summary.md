# PaidSoon — Environment Setup Summary

Generated: 2026-06-21

This document summarises the local → preview → production environment workflow for
PaidSoon. It is the single-page overview; detailed operational steps are in the runbooks.

---

## 1. Files created

| File | Purpose |
|---|---|
| `.env.local.example` | Template for developer `.env.local` files — local environment defaults, all placeholders |
| `.env.preview.example` | Documents the Vercel Preview environment variable shape |
| `.env.production.example` | Documents the Vercel Production environment variable shape |
| `docs/environment-promotion.md` | Full environment promotion guide: git flow, migration workflow, seeding, safety |
| `scripts/db-reset-local.ts` | Destructive local DB reset script with guardrails against production use |
| `docs/paidsoon-environment-setup-summary.md` | This file |

---

## 2. Files changed

| File | Change |
|---|---|
| `package.json` | Added `db:reset:local` script |
| `.gitignore` | Added `!.env*.example` exception so example env files can be committed |

---

## 3. Scripts added or updated

| Script | Command | Purpose |
|---|---|---|
| `db:reset:local` | `SEED_ENV=local node --import tsx scripts/db-reset-local.ts` | Destroy and rebuild the local database from migrations (safety-gated) |

### Full script inventory (post-change)

| Script | Command | Notes |
|---|---|---|
| `dev` | `next dev` | Start local dev server |
| `build` | `prisma generate && next build` | Production build (also generates Prisma client) |
| `start` | `next start` | Serve production build locally |
| `lint` | `eslint` | ESLint 9 |
| `test` | `node --experimental-test-module-mocks --import tsx --test tests/**/*.test.ts` | Node built-in test runner |
| `verify-rls` | `node --import tsx scripts/verify-rls.ts` | Verify RLS tenant isolation |
| `seed:local` | `SEED_ENV=local node --import tsx scripts/seed-preview.ts` | Seed local dev DB with fake test data |
| `seed:preview` | `SEED_ENV=preview node --import tsx scripts/seed-preview.ts` | Seed shared dev DB from local machine (preview posture) |
| `verify-seed` | `node --import tsx scripts/verify-seed.ts` | Verify seed data coverage |
| `db:reset:local` | `SEED_ENV=local node --import tsx scripts/db-reset-local.ts` | **New** — destructive local DB reset with safety gates |

---

## 4. Environment variables documented

All env vars are defined in [docs/runbooks/README.md](./runbooks/README.md).
The three new example files surface per-environment defaults:

| Variable | Local | Preview | Production |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | preview alias URL | `https://paidsoon.com` |
| `LIVE` | `false` | `false` | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | `paidsoon-dev` | `paidsoon-dev` | `paidsoon-prod` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `paidsoon-dev` key | `paidsoon-dev` key | `paidsoon-prod` key |
| `SUPABASE_SECRET_KEY` | `paidsoon-dev` secret | `paidsoon-dev` secret | `paidsoon-prod` secret |
| `DATABASE_URL` | `paidsoon-dev` pooler | `paidsoon-dev` pooler | `paidsoon-prod` pooler |
| `DIRECT_URL` | `paidsoon-dev` direct | `paidsoon-dev` direct | `paidsoon-prod` direct |
| `CRON_SECRET` | optional | not required | required |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_live_…` |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe CLI | not set | live dashboard `whsec_…` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe CLI | not set | live dashboard `whsec_…` |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `onboarding@resend.dev` | `billing@paidsoon.com` |
| `RESEND_FROM_NAME` | `PaidSoon (dev)` | `PaidSoon (preview)` | `PaidSoon` |
| `SEED_ENV` | `local` (scripts only) | not a persistent var | **never set** |

---

## 5. Local development workflow

```
git checkout -b feature/my-change
cp .env.local.example .env.local   # fill in paidsoon-dev credentials
npm install
npx prisma migrate deploy          # apply schema to paidsoon-dev
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls
npm run seed:local
npm run dev -- --port 4001                        # → http://localhost:4001
```

---

## 6. Preview/staging workflow

```
git push origin feature/my-change
# → Vercel auto-deploys a preview URL

# Optionally seed the shared paidsoon-dev DB from your local machine:
npm run seed:preview
npm run verify-seed

# Test the preview URL — it uses paidsoon-dev Supabase + Stripe test mode
```

---

## 7. Production deployment workflow

```
# 1. Open a PR from develop → main. Review.
# 2. Apply any pending migrations to paidsoon-prod:
export DIRECT_URL="postgresql://postgres:PW@db.prod-ref.supabase.co:5432/postgres"
npx prisma migrate deploy
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls   # must pass before merging

# 3. Merge develop → main → Vercel auto-deploys to production.
# 4. Verify production smoke test (see docs/runbooks/vercel.md §9).
```

---

## 8. Database migration workflow

```
# Create
npx prisma migrate dev --name describe_your_change

# Update RLS if needed
$EDITOR prisma/rls-policies.sql
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls

# Commit
git add prisma/schema.prisma prisma/migrations/ prisma/rls-policies.sql
git commit -m "feat: <change description>"

# Apply to preview
export DIRECT_URL="<paidsoon-dev direct URL>"
npx prisma migrate deploy

# Apply to production (after preview testing)
export DIRECT_URL="<paidsoon-prod direct URL>"
npx prisma migrate deploy
```

---

## 9. Seed data workflow

```
# Seed local
npm run seed:local      # SEED_ENV=local, targets DATABASE_URL in .env.local
npm run verify-seed     # must exit 0

# Re-seed (idempotent — safe to run any time)
npm run seed:local

# Reset and re-seed from scratch (destructive)
npm run db:reset:local  # SEED_ENV=local, uses DIRECT_URL
npm run seed:local

# Seed preview (from local machine, targets paidsoon-dev)
npm run seed:preview
npm run verify-seed
```

---

## 10. Safety guardrails

### `scripts/seed-preview.ts`

Two guards prevent seeding production:

1. **`SEED_ENV` whitelist** — allows `local`, `preview`, `development`, `test`;
   blocks `production`, `prod`, unset, unknown.
2. **`DATABASE_URL` scan** — rejects strings containing `paidsoon-prod`, `-prod.`,
   `.prod.`, `paidsoon_prod`.

### `scripts/db-reset-local.ts`

Two guards prevent resetting non-local environments:

1. **`SEED_ENV` allowlist** — only `local` or `development`; blocks `production`,
   `prod`, `preview`, unset, unknown.
2. **`DIRECT_URL` scan** — same production marker checks as the seed script.

### Architectural separation

- `paidsoon-dev` and `paidsoon-prod` are separate Supabase projects with separate
  credentials. A leaked dev credential cannot access prod data.
- Vercel environment targets (`Preview` vs `Production`) ensure that preview deployments
  never receive production Supabase URLs or Stripe live keys.

---

## 11. Verification steps

### After local setup

```bash
npm run verify-rls     # must print: PASS: RLS is enforced.
npm run seed:local
npm run verify-seed    # must exit 0
```

### After a schema change

```bash
npx prisma migrate deploy
psql "$DIRECT_URL" -f prisma/rls-policies.sql
npm run verify-rls
```

### After seeding

```bash
npm run verify-seed
```

### Production smoke test

See [docs/runbooks/vercel.md §9](./runbooks/vercel.md) for the manual smoke-test checklist.

---

## 12. Assumptions made

1. **Two Supabase projects** (`paidsoon-dev` and `paidsoon-prod`) are the intended
   structure. Local and Vercel Preview share `paidsoon-dev`.
2. **Prisma is the migration tool**, not the Supabase CLI. The workflow uses
   `prisma migrate dev` locally and `prisma migrate deploy` on hosted environments.
   No `supabase/` directory is expected or required.
3. **`SEED_ENV` is script-only.** It is not an application runtime variable. It must
   never be set as a persistent Vercel environment variable.
4. **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** is the correct variable name (Supabase's
   newer `sb_publishable_…` key). Do not use the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **`SUPABASE_SECRET_KEY`** is the correct variable name (the newer `sb_secret_…`
   key). Do not use the legacy `SUPABASE_SERVICE_ROLE_KEY`.

---

## 13. Gaps and manual steps still required

| Item | Status | Notes |
|---|---|---|
| Create `paidsoon-dev` Supabase project | Manual | Follow [docs/runbooks/supabase.md](./runbooks/supabase.md) |
| Create `paidsoon-prod` Supabase project | Manual | Same runbook, second time |
| Set Vercel environment variables | Manual | Follow [docs/runbooks/vercel.md §2](./runbooks/vercel.md) |
| Register Stripe webhook endpoints (production) | Manual | Follow [docs/runbooks/stripe.md](./runbooks/stripe.md) §5–§6 |
| Verify `billing@paidsoon.com` in Resend | Manual | Follow [docs/runbooks/resend.md](./runbooks/resend.md) |
| Create Supabase Auth users for sign-in testing | Manual | See [docs/preview-seed-data.md](./preview-seed-data.md) — seed UUIDs don't map to real auth users |
| Extend seed for new schema fields | Future | When dispute reason, partial payment, MYOB sync metadata columns are added |

---

## See also

- [docs/environment-promotion.md](./environment-promotion.md) — full workflow guide
- [docs/runbooks/README.md](./runbooks/README.md) — canonical env-var matrix
- [docs/preview-seed-data.md](./preview-seed-data.md) — seed data guide
- [docs/paidsoon-preview-seed-summary.md](./paidsoon-preview-seed-summary.md) — seed implementation detail
