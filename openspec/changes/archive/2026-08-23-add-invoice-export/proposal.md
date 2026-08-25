## Why

PaidSoon users on Small Business and Accountant Partner tiers already have a
`csv_export` plan feature reserved for them in `lib/subscriptionPlans.ts`, but
it is listed in `UNIMPLEMENTED_FEATURES` and rendered as "coming soon" on the
pricing page — there is no way today for a user to get their tracked-invoice
data out of PaidSoon for reconciliation, board reporting, or handing to an
accountant/bookkeeper. This forces users to request the data manually or
re-derive it from their accounting system. Since the recent CSV/XLSX
invoice-**import** capability already established safe spreadsheet
generation conventions (shared `xlsx` library, canonical field lists, tenant
scoping), the same patterns can be reused for the export direction to close
this gap.

## What Changes

- New tenant-scoped invoice export capability producing CSV or XLSX files of a
  user's `TrackedInvoice` records (with related customer, payment, promise-to-pay,
  and dispute data), gated behind the existing `csv_export` plan feature
  (Small Business and Accountant Partner tiers).
- A shared, reusable export-filter/query service (status, customer, accounting
  source/provider, and date-range-on-a-selectable-field filtering) used by
  both entry points below — this introduces customer/date-range/provider
  filtering that does not exist on the invoice list today, built as a
  standalone service rather than duplicated inline logic.
- A quick "Export" action on `/dashboard/invoices`, next to the existing
  "Import invoices" action, that exports the invoices currently visible under
  the active status bucket (active/resolved) and overview-card filter, in
  CSV or XLSX, with a loading/disabled state while generating.
- A new "Invoice exports" tab under Settings (`/dashboard/settings/export`)
  offering an advanced export form: format choice, all-invoices-or-date-range,
  date field selection (invoice date / due date / created date), status
  filter, customer filter, and accounting-source filter, plus empty-state and
  error messaging.
- A documented export data dictionary (column name, source field, type,
  nullability, formatting, CSV/XLSX inclusion) covering only fields that
  exist on the current domain model, with explicitly defined derived values
  (e.g. outstanding balance, promise-to-pay summary, dispute summary).
- Spreadsheet-formula-injection sanitisation for both CSV and XLSX cell
  values sourced from user-controlled text (`clientName`, `notes`-equivalent
  free text, etc.), reusing/extending the sanitisation approach already
  established for the import path where applicable.
- Synchronous, streamed generation for the realistic invoice volumes this
  product supports today (tier caps top out at low hundreds of chased
  invoices per period, with no chase-volume cap on already-created historical
  `TrackedInvoice` rows) — with an explicit row-count safety ceiling and a
  documented follow-up path to background/async generation if usage grows
  beyond that ceiling.

## Capabilities

### New Capabilities
- `invoice-export`: tenant-scoped CSV/XLSX export of tracked invoices from the
  dashboard invoice list and from a new Settings "Invoice exports" screen,
  including the shared filtering service, file-generation service, download
  endpoint, spreadsheet-injection protection, and permission gating.

### Modified Capabilities
- None. `csv_export` already exists as a tier-gated feature flag in
  `lib/subscriptionPlans.ts`; this change implements the capability behind
  that existing flag (moving it out of `UNIMPLEMENTED_FEATURES`) rather than
  altering tier boundaries or introducing a new permission model.

## Impact

- Adds new API route(s) under `app/api/invoices/export/**` (or equivalent)
  for streamed CSV/XLSX generation, reusing `withUserContext` for tenant
  scoping and `requireFeature(userId, "csv_export")` for permission gating —
  no new role/permission system.
- Adds a shared filter/query module (e.g. `lib/invoices/exportQuery.ts`) that
  both the dashboard quick-export and the Settings advanced-export screen
  call, avoiding duplicated invoice-filtering logic.
- Adds an export-generation module (e.g. `lib/invoices/export.ts`) built on
  the already-installed `xlsx` package (SheetJS Community Edition, already a
  dependency via the invoice-import feature) for both CSV and XLSX output,
  and a shared sanitisation helper for spreadsheet-formula injection reused
  from/aligned with `lib/invoiceImport/**` conventions.
- Adds UI: an "Export" control on `components/dashboard/InvoiceTable.tsx`'s
  page-level toolbar (`app/dashboard/invoices/page.tsx`), a new
  `app/dashboard/settings/export/page.tsx` + client component, and a new
  entry in the Settings tab list in `app/dashboard/settings/layout.tsx`.
- Removes `csv_export` from `UNIMPLEMENTED_FEATURES` in
  `lib/subscriptionPlans.ts` once implemented, updating the pricing page
  label (`lib/planPresentation.ts`) from "CSV export (coming soon)" to "CSV
  export".
- No new Prisma models are required — the export reads existing
  `TrackedInvoice`, `Customer`, `InvoicePayment`, `PromiseToPay`, and
  `EmailLog` data; no schema migration is needed.
- No new environment variables or database migrations.
- Updates `docs/DDD.md` §3 (Domain Model Overview), §7 (API Design), §11
  (Billing and Entitlements — `csv_export` no longer unimplemented), and §15
  (Reporting, Audit and Export Design — currently states "none implemented");
  updates `docs/runbooks/README.md` only if a new limit/env var is
  introduced; updates `app/(marketing)/pricing/page.tsx` label behaviour via
  `isFeatureImplemented`.
