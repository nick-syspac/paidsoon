## Context

See proposal.md for motivation. The current recurring-spend detector persists only aggregate evidence such as supplier, bill count, and average amount. The imported spend-bill pipeline already normalizes and stores richer source metadata, including provider bill IDs, document numbers, supplier references, and bill dates, but the recurring-spend handoff into SpendLeak detection drops most of that context before the finding evidence is written.

The detail page renders from persisted `SpendInsight.evidence`, not by joining back to imported bills on demand. That keeps the drill-down tenant-safe and stable over time, but it also means the evidence payload itself must carry the recurring rows needed for inspection.

## Goals / Non-Goals

**Goals:**
- Preserve enough recurring-spend evidence at detection time for later review without re-querying source tables.
- Make recurring-spend findings easier to reconcile in MYOB or Xero by surfacing human-usable references before raw provider IDs.
- Keep partial-evidence rendering resilient when dates or references are missing from a provider record.
- Keep the solution additive so existing recurring-spend finding identity and lifecycle behavior remain unchanged.

**Non-Goals:**
- Adding direct deep links into MYOB or Xero record pages.
- Changing duplicate, renewal, supplier-concentration, or cash-pressure evidence formats beyond any shared helper refactors.
- Replacing the raw evidence block or altering review-action workflows.

## Decisions

### Persist recurring cycle rows inside `SpendInsight.evidence`

The detector will extend recurring-spend evidence with additive fields such as observed cadence, first and latest observed dates, and a bounded list of recent recurring-charge rows. Each row should prefer human-usable accounting references such as document number or supplier reference, and include provider source ID as a fallback.

Rationale: the detail page already trusts persisted evidence as the durable explanation of why a finding exists. Storing the recurring rows in that payload preserves explainability even after later syncs, lifecycle changes, or source-table churn.

Alternative considered: query `importedBill` rows dynamically on the detail page using the current finding subject. Rejected because it weakens auditability, can drift from the evidence that originally triggered the finding, and would require inference instead of using the persisted detector output.

### Extend the sync-to-detector handoff rather than reading raw provider metadata later

The accounting sync pipeline should pass through the normalized recurring-spend fields it already has available, such as document number, supplier reference, due date, and paid date, when building detector input.

Rationale: these fields already exist in the canonical imported-bill contract, so the cheapest reliable fix is to stop discarding them before detection. This keeps provider-specific parsing confined to ingestion and lets SpendLeak work from normalized inputs.

Alternative considered: parse provider-specific raw metadata from `rawSourceData` during SpendLeak detection. Rejected because it would duplicate provider logic inside SpendLeak and make behavior less consistent across sources.

### Render a recurring-specific evidence section with a compact row list

The detail presenter should keep the current summary cards but add a recurring-specific section that shows cadence and recent recurring-charge rows in a compact, readable format.

Rationale: owners need enough structure to match the finding back to their accounting package quickly. A row list is more actionable than a flat JSON dump and matches the earlier SpendLeak frontend design intent.

Alternative considered: rely only on the raw evidence JSON block. Rejected because it obscures the accounting references and dates users need to act.

## Risks / Trade-offs

- [Risk] Evidence payload size grows if every recurring finding stores all matched bills. Mitigation: persist a bounded recent-row list plus aggregate counts, not unlimited history.
- [Risk] Providers do not always supply document numbers or supplier references. Mitigation: define fallback ordering and render missing values explicitly.
- [Risk] Export or downstream consumers may begin relying on new evidence keys inconsistently. Mitigation: keep new keys additive and retain existing aggregate fields for backward compatibility.

## Migration Plan

1. Extend the detector input and recurring-spend evidence shape with additive fields only.
2. Update recurring-spend detail rendering to use the richer persisted evidence when present and degrade gracefully when older findings still have the legacy sparse payload.
3. Update targeted tests for detection, detail rendering, and any export behavior that reads source references or dates.

Rollback is low-risk because the change is additive to evidence payloads and the detail view can continue rendering the legacy aggregate fields.