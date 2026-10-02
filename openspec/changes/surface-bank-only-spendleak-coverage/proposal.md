## Why

SpendLeak now allows tenants to select expected source families (including bank-transactions-only), but the dashboard still primarily communicates value through detected findings. For bank-only tenants, sync may be healthy while no alert-grade findings fire, which can look like "no data" even though meaningful spend evidence exists.

This creates avoidable confusion: users expect to see some grounded output when their selected source is synced, especially when that source is bank transactions.

## What Changes

- **MODIFIED** SpendLeak dashboard empty-state behavior to include selected-source coverage evidence instead of only a no-findings message
- **NEW** bank-transaction coverage summary surface for selected-source workflows (for example, record count, recency, and activity indicators)
- **NEW** selected-source-aware explanatory copy clarifying the difference between "data present" and "alert-grade findings"
- **PRESERVED** existing detection thresholds and finding generation logic in SpendLeak engine

## Capabilities

### Modified Capabilities

- `spendleak-dashboard`: selected-source workflows show evidence coverage even when no findings are generated

## Impact

- **UI**: SpendLeak dashboard gains a coverage/evidence card in zero-findings states when selected sources have synced data
- **Loader/service**: dashboard loader must provide source-level evidence metrics for selected source families
- **Copy/UX**: empty state becomes data-aware and distinguishes "no findings" from "no source data"
- **Detection engine**: unchanged in this change
- **Testing**: requires new tests for bank-only selected-source scenarios with synced data but zero findings

## Out of Scope

- Changing SpendLeak detection thresholds or adding synthetic findings
- Disabling ingestion by source selection
- Adding new subscription gates or tier behavior
