## Context

See proposal.md for motivation. The CSV/XLSX import flow already validates, previews, and commits invoice rows through a tenant-scoped import pipeline, while the reminder engine and payment reconciliation logic assume an invoice is already represented as a tracked invoice with a stable status. The missing piece is not a new workflow surface; it is a proof that imported invoices participate in the same lifecycle as native invoice sources.

## Goals / Non-Goals

**Goals:**
- Ensure imported invoices are treated as tracked invoices from commit time onward.
- Preserve payment metadata required for reminder CTA generation.
- Stop reminder generation when the imported invoice is paid or otherwise resolved.
- Keep the CSV/XLSX path compatible with the existing invoice status model and RLS-safe tenant scoping.

**Non-Goals:**
- Replacing the current import UX or introducing a new source-specific workflow.
- Adding a separate payment system for spreadsheet imports.
- Backfilling historical imported invoices that were already committed before this lifecycle fix.

## Decisions

### Reuse the tracked invoice lifecycle rather than creating a spreadsheet-only status model

**Chosen:** The CSV/XLSX commit path will create or update the same tracked invoice records used by other invoice sources, rather than introducing a separate import-specific lifecycle.

**Rationale:** This keeps due-date checks, reminder generation, and payment reconciliation consistent across all sources. It also avoids a split-brain state model where imported invoices behave differently from Stripe/Xero invoices.

**Alternative considered:** Maintain spreadsheet import rows separately from tracked invoices. Rejected because it would require dual logic for reminder suppression, status derivation, and customer reporting.

### Preserve payment metadata in the authoritative tracked invoice record

**Chosen:** Keep `paymentUrl` and any relevant import metadata in the tracked invoice record while retaining provider metadata JSON as an audit artifact.

**Rationale:** The reminder engine is simpler and less error-prone when it reads one canonical invoice record rather than mixing raw import metadata with runtime status checks.

**Alternative considered:** Look up provider metadata live at send time. Rejected because it couples reminder delivery to import-state internals and makes the runtime path less predictable.

### Centralize the stop-sending rule in the shared invoice state model

**Chosen:** A paid or resolved imported invoice must be excluded from reminder generation through the same logic that already handles other invoice sources.

**Rationale:** This avoids the subtle bug class where a spreadsheet row is paid but continues to receive reminders because it bypasses the standard ledger or status reconciliation path.

**Alternative considered:** Add spreadsheet-only suppression logic in the send path. Rejected because it would duplicate business logic and miss future edge cases.

## Risks / Trade-offs

- [Risk] Imported invoices may carry stale or incorrect `payment_url` values.
  - Mitigation: Validate the field during import, retain the raw value for audit, and keep the runtime contract to accept only a valid, non-empty URL.

- [Risk] Payment reconciliation for imported invoices may lag behind the import commit.
  - Mitigation: Use the same payment ledger and status transitions as other invoice sources so the reconciliation path is centralized and testable.

- [Risk] Historical imported invoices remain outside the proof scope.
  - Mitigation: Define the fix for newly committed imported rows and document the operational gap separately instead of silently broadening scope.

## Migration Plan

1. Validate the CSV/XLSX import commit path against the tracked invoice lifecycle requirements.
2. Ensure imported invoices share the same state transitions as other invoice sources for due, paid, and resolved states.
3. Verify `paymentUrl` is retained for reminder use without breaking the import audit trail.
4. Test the full workflow with a committed import and a later payment reconciliation event.
5. Roll back by reverting the import commit logic to its pre-lifecycle behavior only if the proof fails; no schema change is required unless a new field is needed.

## Open Questions

- Should the proof of lifecycle be validated against a single canonical CSV/XLSX fixture or against a broader import matrix including malformed rows and duplicate keys?
- Is payment reconciliation for spreadsheet-imported invoices expected to happen only through the invoice ledger API, or will support staff also update imported rows directly in admin tooling?
