# Proposal

## Why

PaidSoon's dashboard brings together invoice triage and multiple financial-operation modules, but the standalone user manual does not explain the dashboard as one experience or give focused guidance for its Overview, Invoices, and Resolved Invoices pages. A dashboard guide will help customers understand what each section is for, where to go next, and which existing module guide contains setup and workflow details.

## What Changes

- Add a dashboard guide under `docs/user/` that explains the dashboard's navigation and all requested sections: Overview, Invoices, Resolved Invoices, Owner's Digest, DepositGuard, CommitGuard, Cost Guard, MarginGuard, RunwayGuard, Tax Buffer, and SpendLeak.
- Describe the purpose and key information/actions available in each section based on the current UI. Link the eight existing module guides for detailed setup and feature workflows rather than duplicating them.
- Clarify that the Invoices and Resolved Invoices dashboard pages are distinct from InvoiceGuard's reminder settings; explain dashboard filtering/actions and the separation between active and resolved records.
- Update the user-manual index to link to the dashboard guide and distinguish dashboard navigation from the detailed settings/module guides.
- Keep the manual in `docs/user`; do not change application behavior, the in-app Help Centre, routes, APIs, feature gates, or product availability.
- Preserve conservative caveats for gated modules and any estimates, incomplete data, or sample-like dashboard figures; do not imply that every module appears for every plan.

## Capabilities

### New Capabilities

None. This is documentation-only and does not change system behavior. The change declares `skip_specs: true` in `.openspec.yaml`.

### Modified Capabilities

None.

## Impact

- Documentation: add `docs/user/dashboard.md` and update `docs/user/index.md`.
- Relevant implementation references include the dashboard navigation rail, Overview page, invoice list pages, module pages, plan/access checks, and existing focused guides under `docs/user/`.
- No application code, API, data model, dependency, migration, or integration changes. No backward-compatibility impact.
- Main risk is inaccurate or over-promissory product guidance; verify descriptions and visibility claims against current UI and access behavior, and retain the limitations already recorded in the existing module guides.
