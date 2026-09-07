# Canonical Financial Data Model Proposal

## Why

PaidSoon's product direction is a financial-operations platform — invoice chasing is the first
module, with SpendLeak (spend-side intelligence) already designed and its foundation schema shipped
(`add-initial-spendleak-implementation`). But the current receivables data path bypasses any
canonical layer: Xero/MYOB/Stripe/CSV syncs write directly into `TrackedInvoice`, a table that
mixes invoice *data* (external ID, amount, currency, due date, customer identity) with chasing
*workflow state* (status, currentStage, nextEmailAt, snoozedUntil, dispute fields). The
`ProviderInvoiceMapping` table exists solely to paper over this split for accounting-provider
invoices.

If this split persists, every new module (SpendLeak, cash forecasting, Owner Digest) and every new
provider (QuickBooks is already proposed) re-implements provider-specific invoice ingestion against
the workflow table, and the "financial data hub" the product strategy depends on never actually
exists.

Two facts make this the right moment for the change:

1. **There are no customers.** No production data needs to survive the migration. The strangler /
   dual-write approach that would be mandatory post-launch is unnecessary — a direct schema
   refactor with a clean migration is safe now and becomes expensive later.
2. **QuickBooks has not been implemented.** Widening the provider interface is cheapest at N=2
   providers, before a third adapter is written against the old shape. QuickBooks app/credential
   setup (external lead time) proceeds in parallel, but adapter code lands *after* this change so
   it validates the new interface instead of being re-touched by it.

## What Changes

- **NEW** Canonical financial data layer (`FinancialInvoice`, `FinancialContact`,
  `FinancialPayment`): normalized, provider-neutral financial records with source provenance fields
  (`sourceSystem`, `sourceId`, `sourceUpdatedAt`, `syncedAt`, `rawSourceData`) written by every
  ingestion path (Xero, MYOB, Stripe, CSV/XLSX import)
- **NEW** New ingestion paths (including QuickBooks, when implemented) target the canonical layer;
  ingestion adapters are responsible only for "synchronise the customer's financial records into
  PaidSoon", never for feature logic
- **MODIFIED** `TrackedInvoice` narrows to chasing-workflow state (status, reminder schedule,
  snooze, dispute, promise-to-pay linkage) with a 1:1 reference to its `FinancialInvoice`; invoice
  data fields migrate to the canonical record
- **MODIFIED** `Customer` is rebuilt over `FinancialContact` rather than holding its own parallel
  debtor-identity copy; chasing-specific preferences (`neverAutoChase`, `unsubscribed`,
  `cadenceOverride`) remain tenant workflow data
- **MODIFIED** `ProviderInvoiceMapping` and `ProviderContactMapping` are retired — their role is
  absorbed by provenance fields on the canonical records
- **MODIFIED** Invoice chasing reads (dashboard, reminder eligibility, exports, weekly debtor
  summary) source invoice data from the canonical layer through `TrackedInvoice`'s reference
- **MODIFIED** The existing SpendLeak foundation tables (`ImportedBill`, `ImportedBankTransaction`,
  `SupplierProfile`) align to the same canonical naming/provenance conventions (`source_system`,
  `source_id`, `synced_at`) so receivables and spend share one vocabulary; `spendleak-*` sync and
  insight requirements are re-scoped to consume the canonical layer
- **MODIFIED** `quickbooks-integration` is re-scoped to implement its adapter against the canonical
  interface, sequencing after this change

### Explicitly out of scope

- SpendLeak detectors, dashboards, AI summaries (belong to `add-initial-spendleak-implementation`)
- Internal domain event model (`domain_events`) — deferred; will be its own change
- `financial_opportunity` aggregate model — deferred; starts as a derived view when needed
- Migrating the *spend* tables' ingestion (no spend sync exists yet — nothing to migrate, only
  naming alignment)

## Capabilities

### New Capabilities

- `canonical-financial-data`: The normalized, provider-neutral financial record layer with source
  provenance, tenant isolation, and the rule that all ingestion paths write here and all product
  features read from here

### Modified Capabilities

- `accounting-integrations`: Provider sync writes canonical financial records instead of
  provider-specific workflow tables; provider variability is isolated in the adapter layer
- `invoice-import`: CSV/XLSX import finalizes staging rows into canonical financial records
  (alongside accounting-provider syncs) rather than directly into the chasing table
- `customer-directory`: The debtor directory derives identity from canonical contacts; chasing
  preferences remain tenant-scoped workflow data attached to the canonical contact
- `dashboard-overview`, `invoice-export`, `chase-volume-entitlement`,
  `weekly-debtor-summary-delivery` (exact names to be confirmed against `openspec/specs/` during
  implementation): reads source invoice data from the canonical layer
- `spendleak-finops-foundation` (delta in `add-initial-spendleak-implementation`): ingestion and
  insight requirements re-scoped to consume the canonical layer; provenance vocabulary unified
- `quickbooks-connection-lifecycle`, `quickbooks-sync` (deltas in `quickbooks-integration`):
  adapter targets the canonical interface; sequencing dependency recorded

## Impact

- **Schema**: New `financial_invoices`, `financial_contacts`, `financial_payments` tables with RLS
  policies; `tracked_invoices` drops data columns and gains `financial_invoice_id`;
  `provider_invoice_mappings` / `provider_contact_mappings` dropped; `customers` reshaped over
  canonical contacts; provenance-column renames on the SpendLeak foundation tables. This is a
  **destructive migration by design** — pre-launch, no production data to preserve; preview/dev
  seed data is regenerated via `scripts/seed-preview.ts`.
- **Sync**: `lib/providers/accounting/sync.ts` and `lib/invoiceImport/*` re-pointed at the
  canonical layer; `ProviderInvoice`/`ProviderContact` types in `lib/providers/accounting/types.ts`
  widened toward a canonical ingestion contract
- **Chasing**: All reads/writes of invoice data fields move from `tracked_invoices` columns to the
  joined canonical record. Workflow behavior (reminder cadence, snooze, dispute, promises,
  arrangements, payment ledger) is intended to be behavior-identical
- **RLS**: New policies for canonical tables in `prisma/rls-policies.sql`; `npm run verify-rls`
  extended to prove cross-tenant isolation on the canonical layer
- **Docs**: `docs/DDD.md` data model section, `docs/HLD.md` architecture narrative updated to
  describe the hub-and-module structure
- **Sequencing**: This change lands before `quickbooks-integration` implementation and before
  `add-initial-spendleak-implementation` sections 2–5. Conflict with the in-flight
  `subscription-plan-switching` change (51/108 tasks) must be managed — that change does not own
  invoice ingestion, so overlap should be small, but both should not be merged simultaneously
  without a rebase pass
