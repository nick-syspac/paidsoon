## Context

See proposal.md — Why. The template interpolation system already has full support for
`{{paymentLink}}` (via `resolveVars()` in `lib/email/templates.ts`) and the `paymentUrl`
field already exists on `NormalizedInvoice` (populated from Stripe's `hosted_invoice_url`).
The gap is purely persistence: `TrackedInvoice` has no column for the URL, so it is dropped
at ingest time and hardcoded to `undefined` at send time.

Two ingest paths need updating:
1. **Stripe catchup** (`lib/email/catchup.ts`) — scans active Stripe connections for new
   overdue invoices and creates `TrackedInvoice` rows.
2. **CSV/XLSX import commit** (`app/api/invoice-imports/[batchId]/commit/route.ts`) — writes
   imported invoice rows; `payment_url` is already mapped and validated but stored only in
   `providerMetadata` JSON.

## Goals / Non-Goals

**Goals**
- `TrackedInvoice.paymentUrl` is populated at ingest for Stripe and CSV/XLSX sources
- `sendFollowUpEmail()` passes the stored URL into the template system without any live API call
- Existing invoices (pre-migration) retain null and continue without a pay link

**Non-Goals**
- Xero / MYOB payment URLs (those providers don't expose a reliable hosted-payment URL today)
- Refreshing a stored URL if it later changes (Stripe `hosted_invoice_url` is permanent)
- Backfilling existing Stripe-tracked invoices (post-launch operational task if desired)

## Decisions

### Store on column, not via live lookup

**Chosen:** Add `paymentUrl String? @map("payment_url")` to `TrackedInvoice`. Populate once
at ingest. Read at send time from the DB row.

**Alternative:** Call `provider.getInvoiceDetails()` at send time (what the existing TODO
comment implies). Rejected because:
- Adds 1 Stripe API call per reminder email sent (latency + rate-limit exposure)
- Requires fetching provider credentials inside `sendFollowUpEmail()`, which currently has
  no provider dependency
- Stripe's `hosted_invoice_url` is permanent — freshness is not a real concern

### Do not backfill existing rows

Existing `TrackedInvoice` rows will have `paymentUrl = null` after the migration. They
continue to render without a pay link — same as today. A backfill would require calling
`getOverdueInvoices()` (or `getInvoiceDetails()`) for every active Stripe connection, which
is operational scope separate from this code change.

### Keep `payment_url` in `providerMetadata` for CSV rows (audit trail)

The CSV commit route already writes `payment_url` to `providerMetadata`. This is retained
for audit/reference. The new `paymentUrl` column is the authoritative source for send logic;
`providerMetadata` is still useful for debugging.

## Risks / Trade-offs

- **Stripe URL expiry** — Stripe `hosted_invoice_url` pages do not expire; this risk is
  accepted as negligible.
- **Custom CSV URL staleness** — A user who imports a CSV and later changes their invoicing
  system's payment URL has no way to update the stored URL without re-importing. Low
  frequency; accepted.
- **Null for pre-migration invoices** — Expected; accepted by design.

## Migration Plan

1. Add column to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add-tracked-invoice-payment-url`
3. Run `npm run verify-rls` — no new RLS policy needed (existing `tracked_invoices` row-level
   policy covers all columns)
4. Deploy — the column is nullable and the application code is backward-compatible; no
   multi-step rollout needed
5. Rollback: `prisma migrate reset` locally or manually `ALTER TABLE` to drop column in
   production (data in column is recoverable from provider on re-ingest)
