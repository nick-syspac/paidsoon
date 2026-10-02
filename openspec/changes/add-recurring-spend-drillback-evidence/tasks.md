## 1. Detector Evidence Shape

- [x] 1.1 Extend the recurring-spend detector input to retain normalized bill references needed for drill-back, including dates and accounting references already available from spend sync.
- [x] 1.2 Update recurring-spend evidence generation to persist cadence context, observed-date bounds, aggregate counts, and a bounded list of recent recurring-charge rows while preserving backward-compatible aggregate fields.

## 2. Detail Presentation

- [x] 2.1 Update SpendLeak evidence presentation helpers to recognize the richer recurring-spend evidence shape and render explicit fallback labels for missing fields.
- [x] 2.2 Update the recurring-spend detail UI to show recent recurring-charge rows with dates, amounts, and accounting references that users can use to locate the source records in MYOB or Xero.

## 3. Verification

- [x] 3.1 Add or update focused tests for recurring-spend detection so persisted evidence includes cadence and recent source-record rows.
- [x] 3.2 Add or update focused presentation/detail tests for recurring-spend drill-down rendering, including legacy sparse evidence and partial-field fallbacks.
- [x] 3.3 Verify any SpendLeak export behavior that reads source references or transaction dates continues to work with the additive recurring evidence keys.