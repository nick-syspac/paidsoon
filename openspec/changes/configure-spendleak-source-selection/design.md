## Context

SpendLeak currently computes dashboard readiness using a fixed count of three source families (bills, bank transactions, suppliers). This appears in status/presentation logic and is surfaced as partial-data messaging when fewer than three source families have synced. The codebase already supports module-specific settings patterns (for example Cost Guard and CommitGuard), authenticated tenant-scoped settings APIs, and grouped settings navigation.

The objective is to make readiness expectations tenant-configurable while preserving SpendLeak ingestion and detection behavior.

## Goals / Non-Goals

**Goals:**
- Let an eligible tenant choose which SpendLeak source families are expected for readiness
- Persist this choice tenant-safely and validate updates strictly
- Drive SpendLeak dashboard readiness semantics from selected sources
- Expose this control in Settings under the SpendLeak group

**Non-Goals:**
- Turning source selection into an ingestion kill-switch
- Altering provider OAuth scopes or sync contracts
- Changing finding-detection algorithms
- Introducing speculative placeholders for unavailable modules

## Decisions

### 1. Model source selection as tenant settings with safe defaults
Store selected source families as tenant settings. When no row exists, resolve to a default selection containing all supported source families.

**Why:** Preserves current behavior by default and allows incremental rollout without migration-blocking user actions.

### 2. Validate selection with a bounded enum and non-empty constraint
Accept only known source identifiers and reject empty selections.

**Why:** Prevents invalid states and avoids ambiguous readiness semantics.

### 3. Keep ingestion behavior unchanged in phase one
Continue syncing all available spend-side records and generating findings from normalized data, independent of source selection.

**Why:** User request concerns readiness requirements, not sync suppression. This minimizes operational risk.

### 4. Compute partial-data state against selected expected sources
Derive status from: synced selected sources / total selected sources. Unselected sources do not count against readiness.

**Why:** Aligns product behavior with explicit tenant expectations.

### 5. Expose settings in existing module-grouped settings architecture
Add a concrete SpendLeak settings route and nav entry for eligible users, following existing gated settings patterns.

**Why:** Fits current IA and removes the current “No settings available” dead-end for SpendLeak.

## Proposed Data Contract

Suggested canonical source keys:
- `bills`
- `bank_transactions`
- `suppliers`

Suggested settings payload shape:
- `enabledSourceTypes: string[]`

Validation rules:
- array length >= 1
- all values unique
- all values in supported-source enum

## Status Evaluation Contract

Given:
- `enabledSourceTypes`
- latest sync availability per source family

Compute:
- `expectedSourceCount = enabledSourceTypes.length`
- `syncedExpectedSourceCount = count(enabled source families with at least one sync timestamp)`

Behavior:
- `syncedExpectedSourceCount === 0` with accounting connection => `initial_sync`
- `0 < syncedExpectedSourceCount < expectedSourceCount` => `partial_data`
- `syncedExpectedSourceCount === expectedSourceCount` => proceed to stale/empty/ready evaluation based on existing rules

## Risks / Trade-offs

- Source-selection semantics may be misread as ingestion suppression.
  - Mitigation: explicitly label this control as readiness expectation, not sync disablement.
- Future source families require both enum extension and UI copy updates.
  - Mitigation: centralize source metadata in one shared mapping.
- Existing tests assume fixed denominator of three.
  - Mitigation: refactor tests to assert settings-aware denominators.

## Migration Plan

1. Add SpendLeak settings persistence contract with defaults for tenants without explicit settings.
2. Add settings API with strict validation.
3. Add SpendLeak settings route and client form.
4. Thread selected source types into dashboard loader/status composition.
5. Update tests for presentation, loader, and settings navigation.

## Open Questions

- Whether source selection should be represented as inclusion (`enabled`) or exclusion (`ignored`) in API responses.
- Whether future UX should show per-source freshness timestamps directly on the settings page.
