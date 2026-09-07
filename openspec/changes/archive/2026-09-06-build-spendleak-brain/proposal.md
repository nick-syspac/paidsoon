## Why

PaidSoon already has a SpendLeak shell and roadmap positioning, but it still cannot turn spend-side accounting history into reliable actions. The missing layer is the brain: a deterministic ingestion-and-detection pipeline that imports spend data, finds meaningful savings opportunities, and produces grounded summaries without turning PaidSoon into a bookkeeping product.

## What Changes

- NEW spendleak-ingestion capability that imports bills, bank transactions, suppliers, and expense-account context from connected accounting sources into normalized read models with provenance and idempotent refresh behavior
- NEW spendleak-insights capability that generates persisted, explainable findings for recurring spend, price increases, duplicate spend, renewals, supplier concentration/trend, and cash-pressure signals
- NEW spendleak-ai-summary capability that turns persisted findings and evidence into owner-friendly guidance without inventing unsupported claims
- NEW shared spend-side sync orchestration that refreshes the spend data set on the existing accounting cadence while staying read-only against provider systems
- NEW stable evidence and subject-key conventions so repeated syncs and re-analysis update existing findings instead of multiplying duplicates
- NEW failure and freshness handling so the brain can distinguish fresh, stale, partial, and empty spend states consistently

## Capabilities

### New Capabilities
- `spendleak-ingestion`: read-only ingest and refresh of spend-side accounting data into normalized spend read models with provider provenance
- `spendleak-insights`: deterministic detection and persistence of explainable spend findings with evidence and estimated impact
- `spendleak-ai-summary`: grounded owner-facing summaries derived from persisted findings and their evidence

### Modified Capabilities

## Impact

- Accounting provider sync code gains a spend-side refresh path alongside the existing receivables flow
- Spend read models and findings become the source of truth for SpendLeak analysis instead of ad hoc provider lookups
- Existing SpendLeak dashboard consumers can rely on persisted findings, freshness metadata, and grounded summaries instead of placeholder logic
- Tests need new coverage for provider mapping, detector correctness, duplicate suppression, and summary grounding
- `docs/HLD.md` and `docs/DDD.md` need to reflect the new spend-brain architecture after implementation