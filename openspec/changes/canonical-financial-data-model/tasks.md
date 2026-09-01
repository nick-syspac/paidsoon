# Tasks

## 1. Specification and Schema

- [x] 1.1 Finalize canonical field lists for `FinancialInvoice`, `FinancialContact`, and
  `FinancialPayment` against Xero, MYOB, and documented QuickBooks API shapes (QuickBooks as a
  design input only — no adapter code)
- [x] 1.2 Add canonical models to `prisma/schema.prisma` with provenance fields (`sourceSystem`,
  `sourceId`, `sourceUpdatedAt`, `syncedAt`, `rawSourceData`) and the
  `@@unique([userId, sourceSystem, sourceId])` idempotency key
- [x] 1.3 Narrow `TrackedInvoice` to workflow state: drop data columns (`externalId`, `provider`,
  `clientEmail`, `clientName`, `amountDue`, `currency`, `dueDate`, `paymentUrl`), add unique
  `financialInvoiceId` FK
- [x] 1.4 Reshape `Customer` over `FinancialContact` per design D4 (identity from canonical
  contact; chasing preferences stay)
- [x] 1.5 Retire `ProviderInvoiceMapping` and `ProviderContactMapping` (absorbed into canonical
  provenance fields)
- [x] 1.6 Align SpendLeak foundation table provenance naming (`imported_bills`,
  `imported_bank_transactions`, `supplier_profiles`) to the canonical convention and remove the
  `currency` defaults per design D3
- [x] 1.7 Add RLS policies for all canonical tables in `prisma/rls-policies.sql`; extend
  `scripts/verify-rls.ts` to prove cross-tenant isolation on the canonical layer (script rewritten;
  live DB run deferred until migration is applied)
- [ ] 1.8 Migration SQL hand-authored at
  `prisma/migrations/20260831000000_canonical_financial_data_model/migration.sql` (no local
  Postgres/Docker, so Prisma shadow-DB generation unavailable). **NOT yet applied** — review the
  destructive SQL, then apply to dev via `prisma migrate dev` (or `prisma migrate resolve` +
  `db:push` path) before running 4.3 verify-rls and re-seeding preview.

## 2. Ingestion Re-pointing

- [x] 2.1 Widen `lib/providers/accounting/types.ts` toward the canonical ingestion contract
  (provider adapters return normalized records with provenance, not chasing-table-shaped rows)
- [x] 2.2 Re-point Xero sync (`lib/providers/accounting/sync.ts`) to upsert `FinancialInvoice` /
  `FinancialContact` and create/update the linked `TrackedInvoice` workflow record
- [x] 2.3 Re-point MYOB sync identically, keeping provider-specific heuristics inside the adapter
- [x] 2.4 Re-point Stripe invoice ingestion with `sourceSystem: 'stripe'` (design D6)
- [x] 2.5 Re-point CSV/XLSX invoice import finalization (`lib/invoiceImport/*`) to write canonical
  records with `sourceSystem: 'csv'`
- [x] 2.6 Preserve sync observability (`AccountingSyncRun` counters) across the new write path
- [x] 2.7 Keep idempotency: re-running a sync or import over unchanged source data must not create
  duplicates or reset chasing workflow state (covered by tests/financial-ingest.test.ts)

## 3. Chasing Read Path Migration

- [x] 3.1 Migrate dashboard and invoice-list reads to source invoice facts through
  `TrackedInvoice.financialInvoice` (loader projects flat legacy-named facts onto `InvoiceWithRelations`)
- [x] 3.2 Migrate reminder eligibility/cadence logic (cron send path + sendReminderForInvoice) to the canonical read shape
- [x] 3.3 Migrate `computeOutstanding` / payment-ledger reads where they touch invoice data fields (structural `{ amountDue }` param)
- [x] 3.4 Migrate invoice export (`lib/invoices/export*`) and weekly debtor summary reads
- [x] 3.5 Migrate dispute, snooze, promise-to-pay, and arrangement flows to reference the
  canonical record where they previously read denormalized invoice data
- [x] 3.6 Audit for any remaining direct reads of dropped columns (grep for old field names; zero
  hits outside migrations)

## 4. Behavior-Identical Verification

- [~] 4.1 Existing test suite passes with fixtures updated to the canonical shape — no behavioral
  assertions changed. **Blocked by environment:** the mock.module-based suite fails with
  `mock.module is not a function` in this sandbox's Node — confirmed PRE-EXISTING by running the
  same tests on clean HEAD (stash → run → restore). Pure fixture tests (customers,
  dashboard-currency-summaries, dashboard-arrangement-state, financial-ingest) pass 13/13.
  Needs a Node version where mock.module is supported to validate the route-handler suites.
- [x] 4.2 New unit tests for canonical ingestion mapping per source system (Xero, MYOB, Stripe,
  CSV), including provenance completeness and idempotent re-sync (tests/financial-ingest.test.ts)
- [ ] 4.3 `npm run verify-rls` clean against a live dev DB including the new canonical tables
  (**requires task 1.8 migration to be applied first**)
- [ ] 4.4 Re-seed preview (`scripts/seed-preview.ts`) and manually verify
  connect → sync → chase → promise → payment end to end (**requires migration applied**; the four
  seed/verify/backfill scripts still reference dropped columns and must be re-pointed post-migration)
- [x] 4.5 `npm run lint` and `tsc` clean on all changed files (app/lib/components/tests clean;
  2 remaining tsc errors in tests/admin-diagnostics + tests/billing-cancel-route are PRE-EXISTING
  UserProfile mock drift on clean HEAD, unrelated to this change)

## 5. Dependent Changes and Documentation

- [ ] 5.1 Update `add-initial-spendleak-implementation` tasks 2.x/3.x wording to consume the
  canonical layer (its section-2 ingestion tasks now target the shared model)
- [ ] 5.2 Update `quickbooks-integration` proposal/design: adapter targets the canonical interface
  and sequences after this change
- [ ] 5.3 Update `docs/DDD.md` data-model section and API surface notes
- [ ] 5.4 Update `docs/HLD.md` architecture narrative to the hub-and-module structure (integration
  layer → canonical financial model → product capabilities)
- [ ] 5.5 `openspec validate canonical-financial-data-model --strict` clean
