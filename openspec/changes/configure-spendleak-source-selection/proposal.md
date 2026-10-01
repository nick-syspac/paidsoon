## Why

SpendLeak currently treats three spend-source families as a fixed completeness requirement for readiness messaging. This causes unnecessary friction for businesses that do not rely on every source family (for example, some organisations may not maintain supplier-profile sync data but still have strong bill and bank coverage).

A tenant should be able to explicitly choose which spend-source families are expected for their SpendLeak workflow. Readiness and partial-data messaging should then be grounded in that explicit expectation rather than a hard-coded global denominator.

## What Changes

- **NEW** tenant-configurable SpendLeak source-selection settings that let users choose which source families count toward SpendLeak readiness
- **NEW** SpendLeak settings screen under dashboard settings for source selection and explanatory guidance
- **NEW** SpendLeak settings API contract for reading and updating selected source families with strict validation
- **MODIFIED** SpendLeak dashboard status evaluation so partial-data messaging compares synced sources against tenant-selected expected sources
- **PRESERVED** SpendLeak ingestion and detection behavior; this change does not disable ingestion pipelines or mutate provider sync logic

## Capabilities

### New Capabilities

- `spendleak-source-selection`: tenant-scoped selection of expected SpendLeak source families used for readiness semantics and settings UX

### Modified Capabilities

- `spendleak-dashboard`: readiness and partial-data states become settings-aware instead of fixed to three global source families
- `settings-module-navigation`: SpendLeak settings navigation includes a real settings destination for eligible users

## Impact

- **UI**: Adds a SpendLeak settings destination in the settings navigation and page surface for source selection
- **API**: Adds or extends tenant-authenticated SpendLeak settings endpoints for source-selection persistence
- **Data model**: Adds tenant-scoped persistence for selected SpendLeak source families with backwards-compatible defaults
- **Status semantics**: Replaces hard-coded source completeness denominator with selected-source denominator
- **Testing**: Requires updates to SpendLeak presentation, loader, and settings navigation tests to cover source-selection behavior

## Out of Scope

- Disabling underlying provider sync jobs or spend import pipelines per source family
- Recomputing historical findings based on source-selection changes
- Introducing plan-tier changes for SpendLeak access
