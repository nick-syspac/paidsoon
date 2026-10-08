# Design

## Context

See proposal.md for motivation and specs/spendleak-insight-drilldowns/spec.md for observable behavior. The detector currently records the IDs of the matched pair and aggregate comparison data, but not the row objects consumed by the existing transaction-evidence table builder. The UI already renders source-linked tables with horizontal overflow handling.

## Goals / Non-Goals

**Goals:**
- Keep the duplicate finding grounded in the exact pair selected by the existing detector.
- Reuse the current evidence table path and retain compatibility with existing persisted findings.
- Preserve `duplicate_spend` bill-based comparison behavior.

**Non-Goals:**
- Change duplicate detection, pair selection, finding lifecycle, persistence schema, or API behavior.
- Fetch transaction records separately or show transactions outside the matched pair.

## Decisions

- Add the two selected bank-transaction evidence rows to the duplicate-payment finding payload using the existing transaction-row shape (`sourceId`, `description`, `counterpartyName`, `amountCents`, and `transactionDate`). This reuses the format already emitted for cash-pressure evidence. Keep the existing `transactionIds`, `amountCents`, and `dayDifference` fields so stored consumers remain compatible.
- In the evidence presentation, use counterparty evidence when supplier evidence is absent. For `duplicate_payment`, present the matched pair as a clearly titled transaction table using the existing date, amount, description, counterparty, and source-record columns; leave duplicate-spend bill rows unchanged.
- Render only evidence stored with the finding. Do not add database lookups; this maintains the current user-scoped detail read and avoids introducing cross-tenant data exposure paths.
- If a persisted finding has no transaction rows, preserve the current aggregate detail and explicit unavailable-value fallbacks. Do not fabricate dates, descriptions, or record references.

## Risks / Trade-offs

- [Legacy findings lack pair rows] -> Keep aggregate fields and raw evidence visible and render missing values explicitly.
- [Duplicate-spend uses the same comparison section] -> Gate transaction-specific labels and table presentation on `duplicate_payment`; add regression coverage for both finding types.
- [Evidence payload shape changes] -> Keep existing evidence keys and add rows only; no database migration or destructive rewrite is needed.

## Migration Plan

No migration is required. Newly detected findings will include the matched transaction rows. Existing persisted findings remain readable with the fallback behavior. Rollback can remove the new table rendering and row production without changing the database schema or existing evidence fields.

## Open Questions

None.