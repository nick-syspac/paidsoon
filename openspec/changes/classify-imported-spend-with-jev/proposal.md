# Proposal

## Why

PaidSoon imports spend from accounting providers and expense files, but stores provider account fields rather than a consistent business-spending category. This limits useful cross-source analysis of recurring costs and makes SpendLeak, Cost Guard, and MarginGuard harder to compare. A tenant-owned classification layer, with deterministic mappings and rules first and Jev suggestions for unresolved cases, would make imported spend more useful without changing the accounting system of record.

## What Changes

- Add tenant-owned spending categories, including seeded defaults, safe rename/merge/retire lifecycle, and a reserved `Other` outcome.
- Persist one PaidSoon analytical category assignment per imported bill or bank transaction, separate from provider account, tax, contact, and raw-source fields, with origin, review state, and an audit trail.
- Normalize imported transaction direction independently from provider amount-sign conventions so spend summaries and classification do not confuse inflows, outflows, and refunds.
- Resolve explicit manual corrections, source-account mappings, and tenant rules (including only those deliberately created from corrections) before invoking TypeSafe Jev for unresolved records.
- Present Jev results as suggestions with confidence and review status; do not treat a Jev suggestion as an accounting or tax classification. Support correction of one record and an explicit choice to create a tenant-scoped rule for future matches.
- Run unresolved classification asynchronously with bounded retries and tenant isolation so TypeSafe outages do not fail accounting imports. Make classification idempotent across re-imports and preserve manual corrections.
- Expose the shared category to SpendLeak, Cost Guard category analysis, and MarginGuard without replacing MarginGuard's distinct cost classes. Do not write PaidSoon categories back to providers.
- Disclose external processing and minimize the data sent to TypeSafe; enable the feature only after tenant opt-in.

## Capabilities

### New Capabilities
- `spend-classification`: Tenant-owned spending taxonomy, deterministic classification, Jev suggestions, review/correction, and audit behavior.

### Modified Capabilities
- `spendleak-ingestion`: Add idempotent analytical classification to existing imported bills and bank transactions while retaining source provenance and read-only provider behavior.
- `spendleak-finops-foundation`: Make confirmed canonical spending categories available to shared FinOps consumers without duplicating imported spend.
- `cost-guard-detection`: Use canonical PaidSoon categories for category-level spend analysis rather than treating provider account labels as the shared taxonomy.

## Impact

- **Data and security:** Prisma spend/category/classification models, migrations, row-level security, audit events, and RLS isolation tests. User-facing category and correction operations must use authenticated tenant context; any system worker must scope work to the owner recorded on each imported record.
- **Import and jobs:** Provider normalization and sync upserts, CSV/XLSX spend commit, a bounded background classification worker, cron configuration, retry state, and safe operational metrics.
- **Product surfaces:** Spend review/category management, classification settings and opt-in, category aggregation in SpendLeak and Cost Guard, and MarginGuard consumption that leaves its cost classification unchanged.
- **External service:** Add a server-only TypeSafe API integration and document `TYPESAFE_API_KEY`, provider data handling, and measured token usage. Category names/descriptions and minimized transaction context leave PaidSoon only for opted-in tenants.
- **Compatibility and scope:** Existing provider source fields and raw data remain unchanged; existing source-ID upserts remain the import idempotency boundary. This classifies current imported bills and bank transactions (including CSV/XLSX records stored in those models), not new journal entries or per-line splits. Jev output is advisory, not a replacement for a chart of accounts, tax code, or bookkeeping decision.