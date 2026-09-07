## Context

See proposal.md - Why.

The current settings experience splits import and export across separate routes and repeated headings. The codebase already has reusable invoice import and invoice export clients, and the SpendLeak work has a separate expense-import workflow that can be surfaced in the Settings area without changing the underlying ingestion model.

## Goals / Non-Goals

**Goals:**
- Present one Settings route for invoice import, expense import, and invoice export.
- Reuse the existing invoice import and invoice export implementations rather than duplicating their logic.
- Keep the old import/export entry points working through redirects or aliases.
- Preserve existing auth and plan-gating behavior.

**Non-Goals:**
- No new import or export data model.
- No change to invoice import validation semantics.
- No change to invoice export filtering, file formats, or entitlement rules.
- No change to the underlying SpendLeak expense-import backend behavior.

## Decisions

1. Use a single combined settings route as the canonical surface.
   - Rationale: the user’s intent is to manage related data workflows in one place, and a single route avoids duplicate navigation state.
   - Alternatives considered: keeping separate tabs with in-page anchors, which still forces cross-tab navigation and preserves the current split.

2. Reuse the existing invoice import and invoice export clients inside sectioned containers.
   - Rationale: these workflows already encapsulate the hard parts, so the combined page should compose them rather than reimplement them.
   - Alternatives considered: rebuilding both flows into a single custom form, which would create avoidable regression risk.

3. Surface expense import as a peer section rather than folding it into invoice import.
   - Rationale: invoice and expense data have different semantics, validations, and downstream destinations; keeping them visually adjacent but logically separate avoids conflating the workflows.
   - Alternatives considered: extending invoice import with a mode switch, which would blur behavior and complicate future maintenance.

4. Preserve old import/export URLs as redirects or aliases.
   - Rationale: users may have bookmarks or deep links, and compatibility should survive the navigation consolidation.
   - Alternatives considered: removing the old routes entirely, which would create broken links and unnecessary support issues.

## Risks / Trade-offs

- [Risk] The combined page will be heavier than the current split routes. → Mitigation: keep each section isolated and only load the client workflow that each section needs.
- [Risk] Users may be unsure whether expense import belongs with invoice import. → Mitigation: label the sections explicitly and keep the workflows visually distinct.
- [Risk] Redirect behavior could make the active section ambiguous on legacy links. → Mitigation: preserve section-specific deep links where practical and default the combined page to the import section.