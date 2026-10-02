## 1. Evidence Contract

- [x] 1.1 Extend the SpendLeak evidence shape so supported finding types can preserve drillback-friendly rows and source references in persisted findings.
- [x] 1.2 Keep the existing recurring-spend payload compatible while confirming legacy findings continue to read with aggregate evidence only.

## 2. Detail Presentation

- [x] 2.1 Update the SpendLeak evidence presentation helpers to render a shared drillback row table for supported finding types.
- [x] 2.2 Update the detail UI so record rows, source references, and fallback labels appear consistently across supported findings.

## 3. Verification

- [x] 3.1 Add or update focused engine tests to confirm the persisted evidence includes drillback-friendly rows where available.
- [x] 3.2 Add or update focused presentation and detail tests to confirm non-recurring findings render source-linked records and sparse payload fallbacks.
