## Context

See proposal.md - Why. The current invoice-import capability already has a safe CSV workflow, but the implementation still exposed Excel-specific import affordances before the launch-safety decision was made.

## Goals / Non-Goals

**Goals:**
- Make the import UX, API contract, and documentation agree that CSV is the only supported import format for now.
- Remove the Excel-specific upload/template surface from the import flow.
- Keep the rest of the invoice-import lifecycle unchanged: template download, mapping, validation, staging, commit, and tenant scoping.
- Preserve the ability to reintroduce spreadsheet imports later if the security and dependency posture changes.

**Non-Goals:**
- Changing invoice export formats.
- Redesigning the import mapping, validation, or commit model.
- Reworking the CSV parsing or reconciliation rules beyond excluding Excel inputs.
- Introducing a new spreadsheet parser or dependency.

## Decisions

1. **CSV-only import instead of "CSV plus accepted Excel files"**
   - Rationale: the launch goal is a single, easy-to-explain import path with no ambiguity about what the product supports.
   - Alternatives considered: keep the Excel template visible but reject uploads server-side. Rejected because it creates a user-visible mismatch and invites support friction.

2. **Enforce the restriction at both the UI and API boundary**
   - Rationale: hiding the Excel template in the UI is not enough; the upload route must be the source of truth so direct requests cannot bypass the restriction.
   - Alternatives considered: UI-only hiding. Rejected because it is trivially bypassed.

3. **Remove Excel handling from the parser path rather than keeping dormant support**
   - Rationale: the simplest safe state is to have a parser that only accepts the supported format. That reduces code surface and prevents accidental regression back to XLSX support.
   - Alternatives considered: preserve XLSX parsing behind a feature flag. Rejected because the feature is intentionally out of scope for launch and does not need dormant complexity.

4. **Keep the existing CSV template and import flow intact**
   - Rationale: the CSV workflow is already the working path and does not need additional product change.
   - Alternatives considered: redesign the template or mapping flow at the same time. Rejected as unnecessary scope expansion.

## Risks / Trade-offs

- Users who prepared Excel files will need to convert them to CSV -> Mitigation: make the upload error explicit and update the import screen copy to say CSV only.
- Removing Excel support may be seen as a temporary regression -> Mitigation: frame the change as a launch-safety restriction and keep the spec narrowly scoped so Excel can be reintroduced later.
- The product now has a smaller import surface than the export surface -> Mitigation: document that import and export are intentionally independent features.

## Migration Plan

1. Update the import screen copy and template affordances to CSV only.
2. Reject `.xlsx` uploads at the API boundary with a clear validation message.
3. Ensure the parser only accepts CSV inputs.
4. Update tests and documentation so the supported import contract is unambiguous.
5. If Excel support is reintroduced later, restore it as a separate change after the dependency and security review.
