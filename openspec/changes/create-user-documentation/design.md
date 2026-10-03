# Design

## Context

See proposal.md for motivation and scope. The product already has a grouped Settings navigation in `lib/settings/navigation.ts`; its visible labels and destinations are the guide’s route/name source of truth. `docs/user/` is empty, while the in-app Help Centre is separately authored from `content/help/`. The guide set must remain a repository Markdown manual and must not be presented as Help Centre content.

Current UI and plan behavior are not uniform across modules. Plan access comes from `lib/subscriptionPlans.ts` and feature-specific access helpers; visible controls and actual implementation must both be checked. The existing UI also has important constraints: account email is read-only; invoice CSV import differs from expense CSV/XLSX import; CashPlan’s settings page displays, rather than edits, its current values; Owner’s Digest delivery checks UTC; and some Cost Guard and RunwayGuard dashboard output is static/sample-like. The guides must call out limitations rather than turn visible labels into claims of live functionality.

## Goals / Non-Goals

**Goals:**
- Give a new customer a clear route from account setup through connections and subscription to configuring each requested settings area.
- Keep individual guides short, navigable, and organized by the Settings groups/product modules customers see.
- State prerequisites, current plan eligibility, setup/use steps, and useful troubleshooting without inventing behavior.
- Make product limitations, estimates, read-only screens, and unsupported workflows explicit.

**Non-Goals:**
- Change application UI, routes, feature gates, Help Centre publishing, or product behavior.
- Document admin or internal operating procedures, or promise planned features.
- Provide financial, tax, accounting, or legal advice.

## Decisions

1. **Create a small Markdown guide set rather than one long manual.** Add `docs/user/index.md` as the entry point, `getting-started.md` for first-time setup, `general-settings.md` for Account/Connections/Subscription (and a short note if Team appears but is not fully available), and focused guides for `invoiceguard.md`, `depositguard.md`, `spendleak.md`, `owners-digest.md`, `commitguard.md`, `cost-guard.md`, `marginguard.md`, `runwayguard.md`, `tax-buffer.md`, and `cashplan.md`. The index links every page and describes a recommended reading order. This keeps feature-specific procedures maintainable while providing one clear onboarding path.

2. **Use displayed names and canonical dashboard routes.** Match the current settings labels, including “InvoiceGuard,” “Import / Export,” “Owner’s Digest,” “Cost Guard,” and “Tax Buffer.” Refer to `/dashboard/settings/...` destinations in prose; identify the dashboard module page separately when a guide describes the workflow beyond settings. Do not introduce alternative or legacy routes as primary instructions.

3. **Use a consistent task-oriented page structure.** Each feature guide should explain what the feature does, who can access it/prerequisites, where to find its settings, numbered setup steps, how to use or interpret the corresponding dashboard, plan limits and current caveats, and common problems/next steps. The Getting Started page links into the settings guides rather than duplicating every control. The index is the table of contents, not a second copy of the procedures.

4. **Verify claims against the code that owns them.** Use the current settings pages/components for control names and save behavior; `lib/subscriptionPlans.ts` plus feature access helpers for eligibility; and dashboard/services for what the feature actually does. Where UI and backend disagree or a dashboard contains fixed/example output, describe the limitation conservatively and record the affected claim for review. Never use legacy marketing copy or archived proposals as evidence of current behavior.

5. **Separate similarly named import/export workflows.** In the InvoiceGuard guide, distinguish invoice CSV import from expense CSV/XLSX import, filtered invoice CSV/XLSX export, MarginGuard exports, and CommitGuard JSON settings transfer. State that these are specific transfers, not a complete account backup/restore; specify which data each workflow includes and its plan requirement based on current implementation.

6. **Describe restricted or uncertain behavior conservatively.** The General guide will say that the account email cannot be changed from Account settings and explain the current Connections flow without asking customers to share OAuth credentials. InvoiceGuard must distinguish fixed Essentials reminder timing from configurable higher-tier timing and must not claim per-customer wording or multiple template workflows are shipped. Digest delivery time must not be described as local time. Cost Guard and RunwayGuard caveats must warn that static/sample-like dashboard figures are not verified live account forecasts. Tax Buffer numbers are estimates, not advice. CashPlan settings are a read-only status/settings review, not an editing form. Do not promise unsupported Team seats, approval workflows, QuickBooks availability, or other features marked unimplemented/planned.

7. **Use plain Markdown and relative documentation links.** Keep the documents readable on GitHub and in the repository; no new renderer, dependency, generated content, screenshots, or application navigation is needed. Link between related guides with relative paths and keep links to actual product routes as plain route text where appropriate.

## Risks / Trade-offs

- [Plan or implementation changes can make eligibility guidance stale] → Verify each tier claim against the current catalog/access helper while drafting; avoid embedding prices and mark the guide set for review when plan gates change.
- [Users may mistake this manual for in-app Help Centre content] → Keep it under `docs/user`, label its index as the repository user manual, and do not modify `content/help` or Help Centre routes.
- [Dashboard values may look authoritative despite static/sample output] → Explicitly identify the current Cost Guard and RunwayGuard limitations and do not use their sample values as examples.
- [Broad module coverage may create uneven depth] → Follow the shared page structure and check every page against its live settings screen and the user’s requested module list.

## Migration Plan

No application or data migration is required. Add the Markdown files under `docs/user/`; review the internal links, routes, product labels, plan/access claims, and caveat statements. Rollback consists of reverting those documentation additions.
