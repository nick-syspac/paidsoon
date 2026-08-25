## Why

Reminder emails currently render `{{paymentLink}}` as an empty string because `paymentUrl`
is always `undefined` at send time — a hardcoded stub (`lib/email/send.ts:219`). The data
exists at invoice-ingest time (Stripe's `hosted_invoice_url`, CSV's `payment_url` column)
but is never persisted to `TrackedInvoice`. Debtors receive no direct payment link in any
reminder, reducing conversion.

## What Changes

- Add a `payment_url` column to `tracked_invoices` (nullable `String`)
- Populate it from `NormalizedInvoice.paymentUrl` in the Stripe catchup scan (`lib/email/catchup.ts`)
- Populate it from `values.payment_url` in the CSV/XLSX import commit route
- Remove the `paymentUrl: undefined` stub in `sendFollowUpEmail()` and read from `invoice.paymentUrl`
- No new API calls at send time — the URL is captured once at ingest

## Capabilities

### New Capabilities

- `reminder-payment-link`: Reminder emails include a "Pay invoice →" link when a payment URL
  is available for the invoice (Stripe hosted invoice URL, or a custom URL from CSV import)

### Modified Capabilities

<!-- No existing spec requirements are changing — the template-interpolation spec already
     defines {{paymentLink}} behaviour correctly; this change simply ensures the URL is
     supplied. invoice-sync spec covers accounting providers (Xero/MYOB) not Stripe catchup. -->

## Impact

- `prisma/schema.prisma` — new column on `TrackedInvoice`
- `prisma/rls-policies.sql` — no new policy needed (existing `tracked_invoices` RLS covers all columns)
- `lib/email/catchup.ts` — write `paymentUrl` at invoice-ingest time
- `app/api/invoice-imports/[batchId]/commit/route.ts` — write `paymentUrl` from `values.payment_url`
- `lib/email/send.ts` — read `invoice.paymentUrl` instead of hardcoding `undefined`
- `tests/` — add test for the send-time passthrough
- Existing invoices in the DB will have `paymentUrl = null` after migration and continue to render without a pay link; only newly ingested invoices gain the link
