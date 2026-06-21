# PaidSoon — Preview Seed Data

This guide covers how to seed the local or Supabase preview database with
realistic test data for end-to-end testing.

> **Safety:** The seed script will refuse to run if `SEED_ENV` is unset,
> set to `production`, or set to an unknown value. It will also abort if
> `DATABASE_URL` appears to reference a production project. See [Safety checks](#safety-checks).

---

## Environment variables required

| Variable | Purpose | Value for local seeding |
|---|---|---|
| `SEED_ENV` | Tells the seed script which environment it is targeting. Required. | `local` |
| `DATABASE_URL` | Prisma runtime connection (authenticator role, pooler). Must point to `paidsoon-dev`. | See [supabase.md §2](./runbooks/supabase.md) |
| `DIRECT_URL` | Only needed if you also run migrations. Not needed for seed alone. | See [supabase.md §2](./runbooks/supabase.md) |

These variables are normally set in `.env.local`. Never set `SEED_ENV=production`.

---

## How to seed locally

Ensure `.env.local` contains a `DATABASE_URL` pointing at `paidsoon-dev`
(the development Supabase project, **not** production).

```bash
npm run seed:local
```

This is equivalent to:

```bash
SEED_ENV=local node --import tsx scripts/seed-preview.ts
```

---

## How to seed the Supabase preview database

Vercel Preview deployments share `paidsoon-dev` with local development
(see [README.md](./runbooks/README.md) — Environments table). To seed against
the shared dev project from your local machine:

```bash
npm run seed:preview
```

This is identical to `seed:local` except `SEED_ENV=preview`. Both target
the same `DATABASE_URL` in `.env.local`; the distinction is intentional so
you can audit which script ran in CI logs.

---

## How to verify the seed worked

After seeding, run:

```bash
npm run verify-seed
```

The script queries the database for all records owned by the seed user IDs and
checks:

- 3 businesses seeded (all three subscription tiers covered)
- ≥ 20 invoices total
- All supported invoice statuses present
- At least one overdue invoice
- At least one disputed (paused) invoice
- At least one promise-to-pay (snoozed) invoice — active and missed
- At least one MYOB-imported invoice
- ≥ 8 unique client email addresses
- ≥ 5 email logs
- All client emails use `.test` fake domains (no real addresses)

Exits 0 on success, 1 if any check fails.

---

## How to reset and re-seed safely

The seed script is **idempotent**. Simply re-run it:

```bash
npm run seed:local
```

On each run it deletes all existing rows owned by the three seed user IDs
(in FK-safe order: email_logs → tracked_invoices → email_settings → schedules
→ invoice_connections → user_profiles) and then recreates everything fresh.

No other data in the database is touched.

---

## Safety checks

The script has two independent guards:

1. **`SEED_ENV` check** — The `SEED_ENV` environment variable must be set to
   one of `local`, `preview`, `development`, or `test`. The script exits 1 if it
   is `production`, `prod`, unset, or an unknown value.

2. **`DATABASE_URL` check** — The connection string is scanned for production
   project identifiers (`paidsoon-prod`, `-prod.`, `.prod.`, `paidsoon_prod`).
   If found, the script exits 1.

To deliberately fail the safety check (e.g. in a test of the guard itself):

```bash
SEED_ENV=production npm run seed:local   # exits 1, nothing is written
```

---

## Seed user IDs and test login guidance

The seed creates three `user_profiles` with synthetic UUIDs:

| UUID | Business | Tier |
|---|---|---|
| `5eed0001-0000-4000-8000-000000000001` | Melbourne Plumbing Co | Solo |
| `5eed0002-0000-4000-8000-000000000002` | Southbank Design Studio | Small Business |
| `5eed0003-0000-4000-8000-000000000003` | Brisbane Electrical Services | Starter |

**These UUIDs do not correspond to any Supabase Auth user.**

To test the full authenticated product (sign-in → dashboard → invoices), you must
create matching auth users manually via the Supabase dashboard:

1. Supabase dashboard → **Authentication → Users → Add user**.
2. Enter a test email (e.g. `owner@preview.paidsoon.test`) and a password.
3. Copy the UUID Supabase assigns.
4. In the database (`user_profiles` table), update the `userId` of one of the
   seed profiles to match the new auth UUID.

Alternatively, use the Supabase service role to create auth users
programmatically — see the [Supabase Auth admin docs](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

---

## Seed scenarios covered

### Melbourne Plumbing Co (Solo tier)

| Invoice | Client | Amount | Status | Stage |
|---|---|---|---|---|
| seed-melb-inv-001 | Good Payer Pty Ltd | $850 | paid | 0 |
| seed-melb-inv-002 | BuildRight Constructions | $2,750 | paid | 1 |
| seed-melb-inv-003 | ACME Hardware Supplies | $1,200 | pending (due in 7 days) | 0 |
| seed-melb-inv-004 | FastBuild Pty Ltd | $350 | pending (due today) | 0 |
| seed-melb-inv-005 | Reliable Corp | $5,500 | pending (7 days overdue) | 1 |
| seed-melb-inv-006 | NorthStar Properties | $850 | pending (14 days overdue) | 1 |
| seed-melb-inv-007 | Old Debt Co | $1,200 | sequence_complete (30 days) | 3 |
| seed-melb-inv-008 | Fixed Corp | $99 | manually_resolved | 0 |
| seed-melb-inv-009 | Contract Dispute Corp | $5,500 | paused (disputed) | 0 |
| seed-melb-inv-010 | Promise Payer Co | $2,750 | snoozed (promise in 7 days) | 1 |

### Southbank Design Studio (Small Business tier)

| Invoice | Client | Amount | Status | Stage |
|---|---|---|---|---|
| seed-sbank-inv-001 | Creative Works Agency | $1,250 | paid | 0 |
| seed-sbank-inv-002 | LateAgain Marketing | $1,890 | pending (7 days overdue) | 1 |
| seed-sbank-inv-003 | LateAgain Marketing | $4,200 | pending (30 days overdue) | 2 |
| seed-sbank-inv-004 | LateAgain Marketing | $3,120 | sequence_complete (65 days) | 3 |
| seed-sbank-inv-005 | NorthStar Agency | $8,750 | paused (disputed) | 1 |
| seed-sbank-inv-006 | Bold Brands Co | $560 | pending (14 days overdue) | 1 |
| seed-sbank-inv-007 | Pixel Media Group | $3,250 | pending (due in 14 days) | 0 |
| seed-sbank-inv-008 | Big Retail Group | $48,750 | pending (due in 30 days) | 0 |
| seed-sbank-inv-009 | Delay Corp | $1,950 | snoozed (promise missed) | 1 |

### Brisbane Electrical Services (Starter tier)

| Invoice | External ID | Amount | Provider | Status | Stage |
|---|---|---|---|---|---|
| — | MYOB-BES-00412 | $1,250 | myob | paid | 0 |
| — | MYOB-BES-00418 | $1,950 | myob | pending (7 days overdue) | 1 |
| — | MYOB-BES-00401 | $12,500 | myob | pending (30 days overdue) | 2 |
| — | MYOB-BES-00398 | $3,300 | myob | paused (disputed) | 2 |
| seed-bris-inv-005 | — | $895 | stripe | snoozed (promise tomorrow) | 1 |
| seed-bris-inv-006 | — | $4,250 | stripe | snoozed (promise in 7 days) | 1 |
| seed-bris-inv-007 | — | $540 | stripe | manually_resolved | 2 |
| seed-bris-inv-008 | — | $9,500 | stripe | pending (due in 14 days) | 0 |

---

## Schema gaps discovered

The following scenarios from the prompt could not be fully represented because
the current PaidSoon schema does not have dedicated fields or tables for them.
They are documented here for future reference.

| Scenario | Gap | Workaround used |
|---|---|---|
| Disputed invoice (reason) | No `disputeReason` field on `tracked_invoices` | `status: "paused"` models the frozen state; reason must be tracked externally |
| Promise-to-pay date | No dedicated `promiseDate` field | `snoozedUntil` field approximates a promise date |
| Customer/debtor table | No separate customer entity | Client info is embedded per-invoice (`clientName`, `clientEmail`) |
| Audit / activity timeline | No `events` or `activity_logs` table | Not seeded; email_logs partially cover sent-email history |
| GST fields | No `taxAmount`, `taxInclusive` columns | All amounts are stored as `amountDue` in cents |
| Multiple currencies per user | Currency is per-invoice but no conversion logic | Seed uses `aud` throughout |
| MYOB sync status/errors | No sync metadata columns | The `provider` field is set to `"myob"` to signal origin; no sync_status column |
| Partially paid invoices | No `amountPaid` or `partialPayment` field | Not seeded |

---

## Manual steps required

1. **Supabase schema must exist.** Run `npx prisma migrate deploy` (via `DIRECT_URL`)
   before seeding.

2. **RLS policies must be applied.** Run `psql "$DIRECT_URL" -f prisma/rls-policies.sql`
   before seeding.

3. **Auth users for sign-in testing must be created manually** in the Supabase dashboard
   (see [Seed user IDs and test login guidance](#seed-user-ids-and-test-login-guidance)).

4. **Stripe Connect accounts in the seed are fake.** The `stripeConnectAccountId` values
   (e.g. `acct_preview_melb_plumbing`) are placeholder strings. Routes that call the
   Stripe API with these values will fail gracefully. Use a real Stripe Connect OAuth
   flow to attach a test-mode account if you need to test live invoice syncing.

---

## Follow-up recommendations

- Add a `disputeReason` field to `tracked_invoices` to enable richer dispute modelling.
- Add a `promisedAt` and `promiseDate` to `tracked_invoices` (or a `promises` table) for
  proper promise-to-pay tracking.
- Add a `source` metadata JSON column to `tracked_invoices` to carry MYOB sync status,
  external sync timestamp, and last sync error.
- Consider a `customers` table to centralise debtor profiles across invoices.
- Consider an `activity_logs` table for an audit timeline (invoice imported, reminder sent,
  promise recorded, etc.).
- For CI: wire `npm run seed:preview` + `npm run verify-seed` into the PR preview build
  pipeline so every preview has fresh seed data automatically.
