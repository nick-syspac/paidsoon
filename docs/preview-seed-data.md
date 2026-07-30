# Development Seed Data

> **Development and preview environments only.** This seed creates fictional
> accounts, customers and invoices for local testing. It refuses to run against
> production and must never be pointed at a production database.

The seed builds a realistic **Australian small business** so that every major
PaidSoon workflow — reminder sequences, ageing, promises to pay, arrangements,
disputes, pauses, accounting imports and tenant isolation — can be exercised
without touching real customer data.

- **Currency:** AUD, stored in cents
- **Tax:** 10% GST, recorded per invoice and per line item
- **Timezone:** `Australia/Melbourne`
- **Email domains:** `*.test` / `*.example.test` only (RFC 2606 reserved — these
  can never be delivered to a real mailbox)
- **Secrets:** none. Every token, Stripe account id and provider id is an
  obviously fake placeholder.

---

## Prerequisites

1. A development or preview Supabase project (never production).
2. Migrations applied: `npx prisma migrate deploy` (or `npm run db:reset:local`).
3. `.env.local` populated with the variables below.

### Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SEED_ENV` | Yes | Must be `local`, `preview`, `development` or `test`. The seed aborts on any other value. Set automatically by the npm scripts. |
| `DATABASE_URL` | Yes | Pooled Postgres connection used to write the seed. Rejected if it looks like a production database. |
| `NEXT_PUBLIC_SUPABASE_URL` | Recommended | Used to create real Supabase Auth users so you can actually sign in. |
| `SUPABASE_SECRET_KEY` | Recommended | Supabase service role key, used only to create/update the three seed auth users. |

### Optional environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SEED_REFERENCE_DATE` | Today in `Australia/Melbourne` | `YYYY-MM-DD`. All invoice dates, due dates, reminder history and promise dates are calculated relative to this date, so the data set is reproducible. |
| `SEED_USER_PASSWORD` | `PaidSoonDev!2026` | Password set on the seeded sign-in accounts. |
| `SEED_SKIP_AUTH` | `false` | Set to `true` to skip Supabase Auth entirely. Profiles are then created against synthetic UUIDs — useful for API/database testing, but **you will not be able to sign in**. |
| `SEED_RESET_ONLY` | `false` | Delete seed-owned records and exit without recreating them. |

---

## Running the seed

```bash
npm run db:seed
```

Run it again at any time — it is **idempotent**. Each run deletes only the
records owned by the three seed accounts and recreates them from scratch, so a
second run produces the same data set as the first.

### Reproducible dates

```bash
SEED_REFERENCE_DATE=2026-07-25 npm run db:seed
```

Without this, "today" is the current date in `Australia/Melbourne`, so ageing
buckets stay realistic as time passes.

### Verifying the seed

```bash
npm run verify-seed
```

This runs a read-only consistency check covering balances and GST
reconciliation, ageing buckets, reminder/state-machine consistency, promise and
arrangement behaviour, tenant isolation, and outbound-activity safety. It exits
non-zero if anything is wrong.

### Resetting

```bash
# Remove only the seeded records, leave the rest of your dev data alone
npm run db:seed:reset

# Nuclear option: drop and rebuild the entire local database, then reseed
npm run db:reset:local
```

`db:seed:reset` deletes only rows owned by the seed accounts. It does **not**
touch arbitrary development data, and it leaves the Supabase Auth users in place
so a later `npm run db:seed` reuses the same user ids.

---

## Signing in

All three accounts share the password `PaidSoonDev!2026` (or `SEED_USER_PASSWORD`).

| Email | Person | Business | Tier | Use it to test |
|---|---|---|---|---|
| `owner@coastline-demo.test` | Danielle Whitcombe | Coastline Plumbing & Gas Pty Ltd | `business` | **Primary account.** Everything: full invoice book, accounting import, promises, arrangements, disputes, custom sender. |
| `bookkeeper@coastline-demo.test` | Marcus Petrides | Coastline Plumbing — Bookkeeping | `starter` | **Restricted account.** A small invoice book with no custom sender, no templates and no accounting connection — use it to verify plan gating and upsells. |
| `owner@yarravalley-demo.test` | Priya Raghavan | Yarra Valley Web Studio | `business` | **Second tenant.** A separate business with its own small data set — use it to prove RLS and tenant isolation. |

> PaidSoon has no organisation/membership model: a tenant *is* a user account.
> "Switching organisation" means signing out and signing in as another seeded
> user. Sign in at `/sign-in` (requires `LIVE=true` in your environment).

---

## What gets seeded

### Coastline Plumbing & Gas (primary, Business tier)

26 invoices across every state the product can represent, plus a Business-tier
configuration: verified custom sender (`accounts@coastline-demo.test`), a
reminder schedule of 3 / 10 / 21 days after due date, a promise-escalation
policy, a customised stage-1 template, Stripe and MYOB invoice connections, an
MYOB accounting connection with sync history, and AI usage records.

**Ageing coverage**

| Bucket | Invoices |
|---|---|
| Not yet due | `hawthorn-fitout` (+12 days), `bendigo-childcare` (+6 days, MYOB) |
| Due today | `brunswick-fitout` |
| 1–7 days overdue | `preston-cafe`, `docklands-fm` |
| 8–30 days overdue | `northcote-dental`, `werribee-logistics`, `southbank-tower`, `altona-cold-storage`, `croydon-community`, `reservoir-tyre`, `keilor-mowing`, `dandenong-freight` |
| 31–60 days overdue | `airport-retail`, `broadmeadows-panel` |
| 60+ days overdue | `sunshine-metal`, `moorabbin-hire` |

**Scenario coverage**

| Scenario | Invoice |
|---|---|
| No reminders sent yet | `hawthorn-fitout`, `brunswick-fitout` |
| Reminder 1 sent | `preston-cafe` |
| Reminders 1–2 sent | `docklands-fm`, `werribee-logistics` |
| Reminder due right now (cron queue is non-empty) | `northcote-dental` |
| Full sequence complete, still unpaid | `sunshine-metal` |
| Partially paid — balance reconciles to the remainder | `fitzroy-bakehouse` |
| Paid in full | `camberwell-strata` |
| Paid across multiple payments | `geelong-roofing` |
| One customer with three outstanding invoices | `yarraville-01/02/03` |
| High-value debt (A$48,730) | `airport-retail` |
| Active promise to pay (reminders suppressed) | `ringwood-auto` |
| Broken promise to pay | `sunbury-landscaping` |
| Kept promise to pay, invoice settled | `essendon-signage` |
| Disputed — collections frozen | `southbank-tower` |
| Collection activity paused (hardship) | `altona-cold-storage` |
| Excluded from automatic reminders | `croydon-community` |
| Reminder sent, delivery not confirmed | `reservoir-tyre` |
| Customer with no usable email address | `keilor-mowing` |
| Archived customer, debt written off | `moorabbin-hire` |
| Instalment-plan arrangement in progress | `dandenong-freight` |
| Broken arrangement | `broadmeadows-panel` |
| Imported from MYOB, not yet due | `bendigo-childcare` |

### Coastline Bookkeeping (restricted, Starter tier)

3 invoices, a 5 / 14 / 30 day schedule, and a Stripe connection. Deliberately
**no** custom sender settings, **no** email templates and **no** accounting
connection, so Starter-tier gating and upsell prompts are visible.

### Yarra Valley Web Studio (second tenant, Business tier)

4 invoices, its own schedule and Stripe + Xero connections, one active promise
to pay, and a Xero accounting connection in the `error` state with a failed
`invalid_grant` sync run. Shares no customers with the primary tenant.

---

## Safety: seeded data cannot cause real activity

Two narrowly scoped safeguards were added so that seeded records can never
produce outbound activity, even if the cron job or a background worker runs
against a seeded database.

### 1. Undeliverable-recipient guard — `lib/email/deliveryGuard.ts`

`sendFollowUpEmail()` and `sendP2PNotification()` check
`isUndeliverableAddress()` before calling Resend. Addresses on reserved,
non-routable names — `.test`, `.invalid`, `.example`, `.localhost`,
`localhost`, and `example.com/.net/.org` — are suppressed.

The reminder is still written to `email_logs` (with a null `resendMessageId`)
so the reminder state machine advances exactly as it would in production, and
`sendFollowUpEmail` returns the sentinel `SUPPRESSED_MESSAGE_ID`.

This runs in all environments, not just development. That is intentional and
safe: these names are reserved by RFC 2606 / RFC 6761 and can never resolve to
a real mailbox, so suppressing them removes a guaranteed-bounce send rather
than changing any real behaviour.

### 2. Demo connection guard — `lib/providers/accounting/demoGuard.ts`

Every seeded `AccountingConnection` uses an `organisationId` prefixed with
`demo-seed:` (for example `demo-seed:myob/coastline-plumbing`).
`syncConnection()` returns a `skipped` result for these, and
`syncAllActiveConnections()` skips them entirely, so no background worker will
attempt a live Xero or MYOB call or flip a seeded connection to `revoked`.

### Other safety properties

- The seed aborts unless `SEED_ENV` is a development-like value, and refuses
  any `DATABASE_URL` that looks like production.
- Stored OAuth tokens are literal placeholders such as
  `demo-seed-access-coastline-not-a-real-token` — not valid ciphertext, so they
  cannot be decrypted into anything usable.
- Stripe Connect account ids are `acct_demo_seed_*` and do not exist in Stripe.
- Invoices carrying an active promise or a pause have `nextEmailAt` cleared, so
  they are not in the reminder queue.

---

## Schema gaps

Some scenarios are represented in `TrackedInvoice.providerMetadata` rather than
in dedicated tables, because the schema has no table for them. The dashboard
does not surface these fields yet — they exist so the data set is complete and
so future features have realistic input.

| Concept | How it is represented | Note |
|---|---|---|
| Organisations, roles, memberships | Not modelled | A tenant is a user account. The "restricted" account is a separate lower-tier user, not a role. |
| Customer entity | Denormalised onto invoices | Grouping is by `clientEmail`. |
| Invoice line items | `providerMetadata.lineItems` | No line-item table. |
| GST / tax | `providerMetadata.gst` | No tax columns on `tracked_invoices`. |
| Payments and part-payments | `providerMetadata.payments`, `amountPaidCents`, `originalTotalIncGstCents` | `amountDue` always holds the **outstanding balance**. |
| Disputes | `providerMetadata.dispute` + `status: "paused"` | No dispute table. |
| Collection pauses | `providerMetadata.collectionPause` + `status: "paused"` | Distinguished from disputes only by metadata. |
| Automation exclusion | `providerMetadata.automationExcluded` + `nextEmailAt: null` | No exclusion flag column. |
| Email delivery status | `EmailLog.resendMessageId` is null | `email_logs` has no delivery-status column, so an unconfirmed delivery is modelled as a missing provider message id. |
| Archived customers | `providerMetadata.archived` + `status: "manually_resolved"` | No archive flag. |
| Activity / audit timeline | Not modelled for tenant users | `admin_audit_logs` covers staff actions only. |
