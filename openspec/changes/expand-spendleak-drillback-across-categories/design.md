## Context

See proposal.md for motivation. The current implementation already persists richer recurring-spend drillback rows and renders them in the detail view, but the same pattern is not yet consistently available across the other SpendLeak finding types. The existing normalized spend models already retain source references, so the main constraint is preserving and presenting those references through the persisted evidence contract without introducing live source lookups.

## Goals / Non-Goals

**Goals:**
- Preserve drillback-friendly source evidence in persisted SpendLeak findings for supported finding types.
- Present source-linked rows consistently in the detail experience when the detector can identify them.
- Keep partial evidence legible and backward compatible for older findings.

**Non-Goals:**
- Adding direct links into accounting-provider record pages.
- Introducing write-back behavior or mutating source records from SpendLeak.
- Reworking the underlying detection heuristics beyond the evidence data they already emit.

## Decisions

- Use a shared, additive evidence-row shape instead of per-category live joins.
  - Rationale: the persisted finding remains the durable explanation for why a record was flagged, and additive fields keep older findings readable.
  - Alternative considered: query source tables on demand in the detail view. Rejected because it weakens auditability, introduces live coupling, and can drift from the evidence that originally triggered the finding.

- Render evidence rows through one generic detail pattern with category-specific labels only where they add clarity.
  - Rationale: the existing recurring-spend view already shows that a compact row table is useful; extending the same pattern avoids a separate bespoke UI per finding type.
  - Alternative considered: create a custom table layout for each category. Rejected because it multiplies UI paths and makes partial-evidence fallbacks harder to keep consistent.

- Keep aggregate summaries and raw evidence alongside drillback rows.
  - Rationale: not every supported finding type will have the same degree of record-level context, and the current summary cards give users a quick explanation even when row-level detail is sparse.
  - Alternative considered: replace summary cards with row lists only. Rejected because it would leave some findings under-explained and make sparse payloads harder to understand.

## Risks / Trade-offs

- [Risk] Evidence payloads grow larger as more findings persist drillback rows. Mitigation: keep the row lists bounded and additive.
- [Risk] Some providers or finding types may not expose enough source metadata to build rich rows. Mitigation: render explicit fallbacks and preserve aggregate fields.
- [Risk] Existing finding records will not be backfilled automatically. Mitigation: make the presentation layer accept legacy payloads without requiring migration.

## Migration Plan

1. Extend the persisted evidence shape for supported SpendLeak finding types with additive drillback fields.
2. Update the detail presentation layer to render the new row format while preserving legacy fallbacks.
3. Refresh focused tests for evidence generation and detail rendering, including sparse legacy payloads.
4. Roll back by ignoring the additive drillback fields if needed; existing aggregate evidence remains valid.
