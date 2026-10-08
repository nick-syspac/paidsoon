# Design

## Context

See proposal.md for motivation. The dashboard navigation currently provides Overview, Invoices, Resolved Invoices, Owner's Digest, DepositGuard, CommitGuard, Cost Guard, MarginGuard, and RunwayGuard. Tax Buffer and SpendLeak are added to that navigation only when the current user's access checks pass. The Overview is a separate triage page with an Attention section and summaries for cash posture, RunwayGuard, Tax Buffer, Owner's Digest, CommitGuard, financial operations, and other available signals. The active invoice table also links to settings/import actions and exposes status-appropriate follow-up actions.

The repository manual already has focused guides for the eight financial modules. These contain setup steps and material qualifications that must remain authoritative, including Cost Guard's sample-like presentation values, RunwayGuard's standalone forecast limitation, and Tax Buffer's estimate-only framing. The dashboard guide should orient users and link to those pages, not rewrite their procedures. This is plain Markdown in the repository user manual; the in-app Help Centre is separate.

## Goals / Non-Goals

**Goals:**
- Explain the dashboard's navigation and distinguish its dashboard pages from similarly named settings areas.
- Explain each of the eleven user-requested sections, its purpose, and the next place to go for detail.
- Keep the information architecture aligned with current route labels, access behavior, invoice statuses, and the existing manual.
- Make conditional visibility, data limitations, estimates, and sample-like values clear without making guarantees about a user's plan or data.

**Non-Goals:**
- Redesign dashboard navigation or change page behavior, module availability, or subscription rules.
- Duplicate detailed setup instructions from existing focused module guides.
- Publish Markdown in the in-app Help Centre or change its indexing/content pipeline.

## Decisions

1. **Add a dashboard orientation page and link it from the manual index.** Create `docs/user/dashboard.md` as the single dashboard map. Update `docs/user/index.md` so readers can start with this page for navigation, then follow links to existing feature-specific guides. This is preferred to creating eleven overlapping documents because eight detailed module guides already exist and are maintained separately.

2. **Organize the guide into Overview, invoice workspaces, and financial modules.** Describe Overview first, then the Invoices and Resolved Invoices pages, then Owner's Digest, DepositGuard, CommitGuard, Cost Guard, MarginGuard, RunwayGuard, Tax Buffer, and SpendLeak. For each module, provide its role, dashboard route where available, and a link to the existing detailed guide. Mention InvoiceGuard as the separate reminder setup area and link its existing guide; do not conflate it with the invoice workspaces.

3. **Treat the current UI and access checks as authoritative.** Use the current dashboard navigation and pages for route names and high-level actions. Explain that some entries depend on plan access and that absence/presence in navigation does not change plan terms. Use existing guides for detailed eligibility or limitations, linking rather than copying potentially time-sensitive tier tables.

4. **Describe Overview as triage and cross-module status, not a complete ledger.** Summarize the visible Attention cards and the available cash/module summaries at a conceptual level. Explain that card click-through can open filtered Invoices, and that deeper detail may require opening the relevant module. Avoid promising that every summary is present for every account or that metrics replace source accounting records.

5. **Describe invoice workspaces by their actual record sets and actions.** Explain that Invoices contains active follow-up records and supports review/actions such as pause, resume, snooze, resolve, dispute, and available exports/import entry points; exact actions depend on invoice state and plan. Explain that Resolved Invoices contains paid or manually resolved records and is separate from active follow-ups. Link to the Help Centre invoice action tutorials only if they already exist and are relevant; keep `docs/user` as the manual's source.

6. **Retain source-guide caveats without flattening distinct module behavior.** Link the relevant guide and include a short caution where it changes how dashboard summaries should be interpreted. In particular, Cost Guard includes static/sample-like presentation values; the standalone RunwayGuard page has sample-like forecast limitations; Tax Buffer outputs are estimates, not advice; and SpendLeak/MarginGuard/Owner's Digest depend on source coverage or entitlement. The guide should not describe planned or gated actions as generally available.

7. **Keep route references and internal document links maintainable.** Use the canonical `/dashboard/...` route text from the current UI and relative Markdown links to the existing guides. Review all links after editing. No screenshots, new renderer, or dependency is needed.

## Risks / Trade-offs

- [A concise dashboard map can become stale as modules change] → Verify labels/routes against the current navigation and each linked feature guide, and keep deep procedures in the existing guide rather than duplicating them.
- [Users may read a visible module or summary as proof of entitlement or complete live data] → State that access and data availability vary, and repeat the consequential limitations from the existing guides.
- [Dashboard overview summaries may be mistaken for authoritative accounting or financial records] → Describe them as summaries for triage and direct users to the source/module detail; preserve estimate and sample-data warnings.
- [InvoiceGuard settings and invoice workspaces have similar names] → Explicitly distinguish reminder configuration from active and resolved invoice lists.

## Migration Plan

No deployment, application migration, or data migration is needed. Add the dashboard guide and update the manual index; verify routes and relative links plus `git diff --check`. Rollback is reverting the documentation-only changes.
