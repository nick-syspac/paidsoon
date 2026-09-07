## Why

SpendLeak is valuable because it detects recurring waste, estimates savings, and tracks owner decisions. Users need a portable report of that analysis for internal review and accountant conversations, but they do not need SpendLeak to duplicate accounting-system export formats.

A focused analysis export closes this gap without turning SpendLeak into a bookkeeping or migration product.

## What Changes

- NEW SpendLeak report export capability that downloads currently filtered SpendLeak findings as CSV or XLSX.
- NEW export row schema focused on analysis and action data (finding context, savings estimates, review outcomes, notes, confidence, and source references).
- NEW explicit product boundary in UX and API copy: this export is for analysis review, not accounting import.
- NEW safety and compatibility behaviors aligned with existing invoice export patterns (tenant isolation, feature gating, predictable file formats, and practical row limits).

## Capabilities

### New Capabilities

- `spendleak-report-export`: export SpendLeak analysis findings as CSV/XLSX with current-filter scope and review metadata.

### Modified Capabilities

- `spendleak-finops-foundation`: SpendLeak surfaces include an analysis export action for findings visibility outside the app.

## Impact

- Affects SpendLeak dashboard/export entry points and a new backend export endpoint.
- Reuses existing CSV/XLSX generation conventions from invoice export where appropriate.
- Introduces a shared SpendLeak export row mapping so CSV and XLSX stay schema-identical.
- Requires tests for filter-respecting exports, row schema correctness, and tenant-safe access denial.
- Requires documentation updates for the new route and report data dictionary after implementation.
