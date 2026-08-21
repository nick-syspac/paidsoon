## 1. Currency-aware aggregation helpers

- [x] 1.1 Add shared currency bucketing logic for invoice summaries so totals are grouped by currency before they are summed.
- [x] 1.2 Update the biggest-debtor helper to rank debtors within each currency bucket instead of merging all currencies into one amount.
- [x] 1.3 Update dashboard summary helpers to emit currency-partitioned totals for cash waiting, KPI copy, and AI summary text.

## 2. Dashboard and email rendering

- [x] 2.1 Update dashboard components to render one summary section per currency when mixed currencies are present, while preserving the existing single-currency layout.
- [x] 2.2 Update the weekly debtor summary email to show per-currency totals and per-currency debtor lists.

## 3. Verification

- [x] 3.1 Add tests covering mixed-currency dashboard summaries and debtor ranking behavior.
- [x] 3.2 Add tests covering mixed-currency weekly debtor summary output and ensure single-currency cases still pass unchanged.
