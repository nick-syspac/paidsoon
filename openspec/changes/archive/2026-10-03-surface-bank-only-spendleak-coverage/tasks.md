## 1. Scope and contract alignment

- [x] 1.1 Confirm selected-source coverage metrics needed for dashboard clarity in zero-findings states
- [x] 1.2 Finalize UI copy distinction between synced source data and generated findings

## 2. Loader and data contract

- [x] 2.1 Extend SpendLeak dashboard loader output with selected-source evidence coverage metrics
- [x] 2.2 Ensure coverage metrics respect selected-source settings (`enabledSourceTypes`) and tenant scoping
- [x] 2.3 Keep finding-generation and status-state semantics unchanged except for coverage visibility in empty state

## 3. Dashboard UI behavior

- [x] 3.1 Add an evidence coverage card for `empty` state when selected sources are synced
- [x] 3.2 Ensure bank-transactions-only users see concrete synced-data indicators even with zero findings
- [x] 3.3 Preserve existing state banners (`initial_sync`, `stale_data`, `partial_data`, `ready`) and avoid conflating coverage with findings

## 4. Testing and verification

- [x] 4.1 Add/extend loader tests for bank-only selected-source scenarios with synced data and zero findings
- [x] 4.2 Add/extend page/presentation tests for empty-state coverage rendering and copy
- [x] 4.3 Verify existing finding module summaries remain unchanged when findings do exist

## 5. Documentation and quality gates

- [x] 5.1 Update DDD/runbook documentation to describe selected-source coverage behavior in empty state
- [x] 5.2 Run OpenSpec validation for this change and resolve any issues
