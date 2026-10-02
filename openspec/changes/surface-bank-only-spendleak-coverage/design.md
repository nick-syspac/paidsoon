## Context

SpendLeak currently computes readiness from selected source sync coverage and then renders module summaries/findings. In selected-source workflows (for example, only `bank_transactions` selected), the dashboard can reach `empty` state when selected sources are synced but no finding rule triggers. Users can interpret this as missing data instead of "data present, no actionable leak pattern".

The change should keep deterministic detection intact while surfacing objective source-evidence coverage in the dashboard.

## Goals / Non-Goals

**Goals:**
- Show objective selected-source coverage evidence in empty-state dashboards
- Make bank-only workflows feel operational when data is synced
- Keep findings and coverage conceptually separate in UI and data contracts

**Non-Goals:**
- Relaxing or changing finding thresholds in `lib/spendleak/engine.ts`
- Emitting informational pseudo-findings into `SpendInsight`
- Altering ingestion pipelines or provider sync semantics

## Decisions

### 1. Add explicit source-evidence coverage summary to dashboard loader output
Provide selected-source-level metrics (for example counts and latest timestamps) to dashboard rendering.

**Why:** This gives users concrete confirmation that ingestion succeeded even when no findings exist.

### 2. Render coverage summary only when selected sources are synced but findings are empty
Display a dedicated card/message in `empty` state rather than mixing with finding cards.

**Why:** Preserves conceptual clarity: coverage confirms data presence; findings represent detected opportunities.

### 3. Keep detection logic unchanged in this iteration
No threshold changes in `detectSpendFindings`.

**Why:** Keeps scope focused and avoids accidental behavior regressions in existing finding quality.

## Proposed Data Contract (dashboard loader)

Introduce a selected-source coverage object, for example:

- `selectedSourceCoverage[]`
  - `sourceType` (`bills` | `bank_transactions` | `suppliers`)
  - `isSelected` (always true in this array)
  - `synced` (boolean)
  - `recordCount` (integer)
  - `latestSyncedAt` (Date | null)

Optional aggregate helper fields:
- `selectedSourcesWithDataCount`
- `selectedSourcesWithoutDataCount`

## UX Behavior

When status is `empty` and selected source coverage shows synced data:
- show "Data synced, no findings yet" framing
- show selected-source evidence stats
- include guidance that findings appear only when detection rules trigger

When status is `initial_sync` or selected source has no data:
- keep existing setup/sync guidance

## Risks / Trade-offs

- Users may read coverage counts as findings.
  - Mitigation: clear labeling and copy separation.
- Additional DB queries can increase loader latency.
  - Mitigation: use lightweight aggregate/count/select and include only selected sources.

## Migration Plan

1. Extend dashboard loader output with selected-source evidence metrics.
2. Update SpendLeak empty-state UI to render coverage card.
3. Add tests for bank-only selected-source synced-but-empty scenarios.
4. Validate no behavior changes to finding generation.

## Open Questions

- Whether to show amount aggregates for bank-only coverage in this change or a follow-up.
- Whether to add export alignment for zero-finding coverage states in a separate change.
