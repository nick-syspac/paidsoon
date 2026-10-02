## Why

Recurring-spend findings already expose source-record rows, but other SpendLeak findings still lean on aggregate summaries or sparse evidence. That leaves users manually hunting in their accounting system when they need to reconcile a finding back to the original bill, payment, or transaction.

## What Changes

- Extend SpendLeak evidence so supported finding types can persist drillback rows and source-linked references, not just recurring spend.
- Update the SpendLeak detail experience to render those rows consistently across supported finding types, with explicit fallbacks when a source reference is missing.
- Keep legacy findings readable by preserving the existing aggregate fields and raw evidence payload.
- Do not add write-back or direct provider deep links; this remains a read-only drillback improvement.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `spendleak-insights`: persisted findings now need to retain drillback-friendly source evidence for supported finding types, not only the recurring-spend path.
- `spendleak-insight-drilldowns`: finding detail views now need to render source-linked record lists consistently across supported finding types, with explicit missing-field fallbacks.

## Impact

- Affected code: `lib/spendleak/engine.ts`, `lib/dashboard/spendleakPresentation.ts`, `components/dashboard/spendleak/*`, and focused SpendLeak tests.
- Affected behavior: persisted SpendLeak evidence shape and detail rendering for supported finding types.
- No new provider integrations, database tables, or mutation paths.
