# PaidSoon Preview Seed — Implementation Summary

Generated: 2026-06-21

---

## 1. Files created or changed

| File | Action | Purpose |
|---|---|---|
| `scripts/seed-preview.ts` | Created | Main seed script — 3 businesses, 27 invoices, 21 email logs |
| `scripts/verify-seed.ts` | Created | Read-only verification script — 20+ checks |
| `docs/preview-seed-data.md` | Created | Operational guide for seeding, testing, and resetting |
| `docs/paidsoon-preview-seed-summary.md` | Created | This summary file |
| `package.json` | Updated | Added `seed:local`, `seed:preview`, `verify-seed` scripts |
| `docs/runbooks/README.md` | Updated | Added `SEED_ENV` to the environment variable matrix |

---

## 2. How to run the seed locally

```bash
# Ensure .env.local canonical inputs select paidsoon-dev (not prod)
npm run seed:local
```

Equivalent to:

```bash
SEED_ENV=local node --import tsx scripts/seed-preview.ts
```

---

## 3. How to run the seed against Supabase preview

```bash
npm run seed:preview
```

Both `seed:local` and `seed:preview` target the project selected by canonical
inputs in `.env.local`. The difference is the `SEED_ENV` value, which is logged and
checked at startup.

For a CI pipeline, set `SEED_ENV=preview`, `SUPABASE_PROJECT_REF`, and secret
`SUPABASE_DB_PASSWORD` through the CI secret manager before running:

```bash
SEED_ENV=preview node --import tsx scripts/seed-preview.ts
```

---

## 4. Environment variables required

| Variable | Value | Required |
|---|---|---|
| `SEED_ENV` | `local` \| `preview` \| `development` \| `test` | **Yes — script exits 1 if absent or unknown** |
| `SUPABASE_PROJECT_REF` | `paidsoon-dev` project ref | Yes |
| `SUPABASE_DB_PASSWORD` | `paidsoon-dev` database password | Yes — secret |

---

## 5. Safety checks added

Two independent guards prevent accidental production writes:

**Guard 1 — `SEED_ENV` whitelist**

- Allowed: `local`, `preview`, `development`, `test`
- Rejected (exits 1): `production`, `prod`, unset, or unknown value

**Guard 2 — derived target production marker scan**

- The connection string is checked for substrings: `paidsoon-prod`, `-prod.`,
  `.prod.`, `paidsoon_prod`
- If any marker is found, the script exits 1 before connecting

The script cannot be accidentally run against production by setting
`SEED_ENV=production` — that is explicitly blocked. An operator would have to
remove both guards to bypass them.

---

## 6. Seed scenarios included

### Businesses seeded

| Business | Subscription tier | User ID |
|---|---|---|
| Melbourne Plumbing Co | solo | `5eed0001-0000-4000-8000-000000000001` |
| Southbank Design Studio | small_business | `5eed0002-0000-4000-8000-000000000002` |
| Brisbane Electrical Services | starter | `5eed0003-0000-4000-8000-000000000003` |

### Invoice status coverage

| Status | Count | Notes |
|---|---|---|
| `paid` | 4 | Includes one where email1 was sent before payment |
| `pending` (future due) | 5 | Due today, in 7, 14, 30 days |
| `pending` (overdue) | 5 | 7, 7, 14, 14, 30 days overdue |
| `paused` | 3 | Models disputed invoices (one per business) |
| `snoozed` | 4 | Includes active promise, missed promise, tomorrow promise |
| `sequence_complete` | 2 | All 3 emails sent, still unpaid |
| `manually_resolved` | 2 | One small, one medium invoice |
| **Total** | **27** | |

### Additional coverage

- **MYOB-imported invoices** — 4 invoices on Brisbane Electrical with `provider="myob"` and external IDs matching MYOB invoice number format (`MYOB-BES-XXXXX`)
- **Recurring late-payer** — LateAgain Marketing has 3 invoices at stages 1, 2, and 3 (sequence_complete) on Southbank Design Studio
- **Large invoice** — $48,750 on Southbank Design Studio (tests UI formatting)
- **Small invoice** — $99 on Melbourne Plumbing Co
- **Custom email sender** — Southbank Design Studio has `resendVerified: true` and a custom `fromEmail`
- **Missed promise-to-pay** — Southbank Design / Delay Corp has a `snoozedUntil` in the past
- **Custom schedule** — Brisbane Electrical Services uses non-default days (5/14/30 vs default 3/10/21)
- **Multiple connections per user** — Brisbane Electrical has both a Stripe and a MYOB connection

### Email log coverage

| Stages present | Count |
|---|---|
| Stage 1 only | 8 |
| Stage 1 + 2 | 4 (2 invoices × 2 logs each) |
| Stage 1 + 2 + 3 | 2 (2 invoices × 3 logs each) |
| **Total email logs** | **21** |

---

## 7. Schema gaps discovered

The following requested scenarios could not be seeded because the schema does
not have the required columns or tables. Each gap is documented in
[docs/preview-seed-data.md](./preview-seed-data.md).

| Gap | Impact on seed | Workaround |
|---|---|---|
| No `disputeReason` field | Cannot seed dispute reason | `status: "paused"` used |
| No promise-to-pay specific fields | No explicit `promiseDate` column | `snoozedUntil` approximates |
| No customer/debtor table | No separate customer entity | Client info on each invoice |
| No audit/activity timeline table | No event history | `email_logs` covers email history only |
| No GST fields | GST-inclusive/exclusive not modelled | Not seeded |
| No MYOB sync metadata columns | No sync_status, last_sync_error | `provider: "myob"` only |
| No partially paid invoice support | No `amountPaid` field | Not seeded |

---

## 8. Manual steps required before seeding

1. **Apply Prisma migrations** against the target Supabase project:
   ```bash
   npm run prisma:migrate:deploy
   ```

2. **Apply RLS policies**:
   ```bash
   npm run db:apply-rls
   ```

3. **Verify RLS** (strongly recommended before seeding):
   ```bash
   npm run verify-rls
   ```

4. **Create Supabase Auth users** if you need sign-in testing.
   The seed user_profiles use synthetic UUIDs (`5eed0001-…`, etc.) that do not
   correspond to any real auth.users. To test the signed-in dashboard,
   create real auth users via the Supabase dashboard and update the seed
   profile `userId` columns to match, or use the Supabase Auth admin API.

---

## 9. Follow-up recommendations

1. **Add schema fields** to support the gap scenarios above (dispute reason,
   promise date, MYOB sync metadata, partial payment).

2. **Wire seed + verify into CI** — add `npm run seed:preview && npm run verify-seed`
   as a post-deploy step in preview deployments so every PR has fresh,
   verified seed data.

3. **Add a `db:reset:local` script** if a destructive wipe of the entire dev
   database ever becomes necessary. This would call `prisma migrate reset`
   against the derived migration target — requires explicit operator intent and is not included
   here to avoid accidental data loss.

4. **Extend seed for new schema features** — when new tables or columns are
   added, update `scripts/seed-preview.ts` in the same PR as the migration.

5. **Seed Supabase Auth users programmatically** using the `SUPABASE_SECRET_KEY`
   admin client (`auth.admin.createUser`) so the end-to-end sign-in flow can be
   tested without a manual dashboard step.
