## Why

Customer identity today is just a `clientEmail`/`clientName` pair duplicated onto every `TrackedInvoice` row — there is no single place to say "never automatically chase this customer," set a per-customer reminder cadence, or mark a customer as unsubscribed. Every per-customer control that PaidSoon needs before launch (this change and later ones) needs a first-class customer record to hang off, so this is the foundational piece.

## What Changes

- New `Customer` model, scoped per tenant (`userId`) and keyed by `(userId, primaryEmail)`, with `neverAutoChase`, `cadenceOverride`, and `unsubscribed` fields.
- One-time backfill migration: for each tenant, group existing `TrackedInvoice` rows by lowercased `clientEmail` and create one `Customer` row per group; backfill `customerId` onto those invoices and onto `Arrangement` (currently keyed on `debtorEmail`).
- Going forward, every invoice-creation code path (Stripe Connect sync, Xero sync, MYOB sync, CSV/XLSX import commit) performs a find-or-create-`Customer`-by-`(userId, email)` step before/alongside creating the `TrackedInvoice`, so `customerId` is never null for new data.
- The reminder cron (`app/api/cron/send-emails/route.ts`) skips any invoice whose `Customer.neverAutoChase` is true or `Customer.unsubscribed` is true, in addition to existing invoice-level status checks.
- `Customer.cadenceOverride`, when set, takes precedence over the tenant's default `Schedule` for that customer's invoices.
- Contact management (multiple accounts-payable emails per customer) and free-text notes are explicitly **out of scope** for this change — they are a deliberate follow-on once this core model is proven.

## Capabilities

### New Capabilities
- `customer-directory`: tenant-scoped customer records with auto-chase, cadence-override, and unsubscribe controls, backfilled from existing invoice/arrangement data and kept in sync by every invoice ingestion path

### Modified Capabilities
- None (no existing capability spec governs invoice ingestion or the reminder cron yet, so this is additive; call sites are listed under Impact)

## Impact

- Prisma schema: new `Customer` model + `customerId` foreign key added to `TrackedInvoice` and `Arrangement`; new migration.
- RLS: `Customer` needs the same `withUserContext`-scoped RLS policy pattern as `TrackedInvoice`/`Arrangement`; update `prisma/rls-policies.sql` and re-run `npm run verify-rls`.
- Code touched: `lib/providers/accounting/*` (Xero/MYOB sync), Stripe Connect invoice sync path, `app/api/invoice-imports/[batchId]/commit/route.ts`, `app/api/cron/send-emails/route.ts`, `lib/actions/auth.ts`-style bootstrap patterns are not affected.
- One-time backfill script (run via `prismaAdmin`, documented reason: pre-existing data has no tenant session context to run under `withUserContext` during a one-off migration).
- Docs: `docs/DDD.md` database-model section gets a new `Customer` entry; no new env vars.
