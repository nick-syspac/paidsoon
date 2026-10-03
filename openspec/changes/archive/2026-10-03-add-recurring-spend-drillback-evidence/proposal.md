## Why

Recurring-spend findings currently persist only aggregate evidence such as supplier, bill count, and average amount. That makes the detail view too thin for owners who need to reconcile the finding back to MYOB or Xero and verify which recurring charges triggered it.

## What Changes

- Modify recurring-spend detection so persisted evidence keeps cadence context, observed dates, and recent source-record references instead of only aggregate totals.
- Modify recurring-spend drill-down presentation so the detail page lists recent recurring charges with dates and accounting references that users can search in their source accounting package.
- Preserve graceful partial-evidence behavior so findings still render when some source references or dates are unavailable.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `spendleak-insights`: recurring-spend findings must retain richer supporting evidence, including cadence and source-record details, so the persisted finding stays explainable and traceable.
- `spendleak-insight-drilldowns`: recurring-spend detail views must present recent recurring-charge rows with dates and source references that help users inspect the originating accounting records.

## Impact

- Affected code: recurring-spend detection and evidence shaping in `lib/spendleak/engine.ts`, accounting-sync handoff in `lib/providers/accounting/sync.ts`, and SpendLeak detail rendering in `lib/dashboard/spendleakPresentation.ts` and `components/dashboard/spendleak/SpendLeakEvidenceDetails.tsx`.
- Affected behavior: persisted `SpendInsight.evidence` for recurring-spend findings and the recurring-spend finding detail experience.
- Affected tests: SpendLeak engine, presentation, detail-page, and any export coverage that depends on source references or transaction dates.