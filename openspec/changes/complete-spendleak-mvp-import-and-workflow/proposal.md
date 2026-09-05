## Why

SpendLeak currently detects useful spend patterns from Xero and MYOB sync data, but the MVP still misses two promised workflows: direct CSV/XLSX expense import and owner decision actions that convert findings into trackable outcomes. Closing these two gaps is necessary for a credible MVP claim and for measurable savings outcomes without forcing users through provider-only connections or ad hoc manual tracking.

## What Changes

- NEW SpendLeak expense import workflow that accepts CSV and XLSX expense files, stages parsed rows tenant-safely, validates mappings, and converts approved rows into SpendLeak-ready spend records.
- NEW owner review lifecycle workflow for SpendLeak findings with explicit decision actions: keep, cancel, renegotiate, or ignore.
- NEW linkage between review decisions and finding state so user decisions are persisted, auditable, and visible in SpendLeak dashboards.
- NEW suppression behavior for keep/ignore decisions so previously reviewed legitimate items are not repeatedly surfaced as fresh unresolved work.
- MODIFIED SpendLeak dashboard and finding detail surfaces so users can apply and see decision outcomes in-product.

## Capabilities

### New Capabilities
- `spendleak-expense-import`: import tenant expense data from CSV/XLSX into SpendLeak analysis models through a validated, reviewable ingestion flow.
- `spendleak-review-workflow`: apply and persist owner decisions (keep, cancel, renegotiate, ignore) for SpendLeak findings and reflect those outcomes in lifecycle state.

### Modified Capabilities
- `spendleak-finops-foundation`: extend current SpendLeak behavior so imported expense datasets and persisted owner decisions are included in dashboard/finding lifecycle behavior.

## Impact

- Affects SpendLeak ingestion APIs and parser/mapping flows to support expense-file import in addition to accounting sync imports.
- Introduces new persisted review-decision data and state transitions for SpendLeak findings.
- Updates SpendLeak dashboard and finding detail UX to present and execute owner decision actions.
- Adds/extends validation, tenant-isolation, and lifecycle tests for import and decision workflows.
- Requires updates to `docs/DDD.md` after implementation to reflect new routes, data model fields/tables, and SpendLeak behavior.