## Context

See proposal.md for motivation. The current public marketing surface is still organized around a four-module model. `components/marketing/marketingContent.ts` restricts `MarketingModuleId`, `MODULES`, and `MODULE_HREF` to PaidSoon, SpendLeak, CostGuard, and CashPlan, while `components/marketing/MarketingNav.tsx` hard-codes the same subset into Product navigation. `app/(marketing)/platform/page.tsx` renders directly from that four-module list, so the broader implemented module inventory visible inside the dashboard and entitlement model is not reflected on the public site.

This change is cross-cutting but content-heavy rather than backend-heavy. It affects multiple marketing routes and shared marketing components, while needing to preserve existing live-mode CTA behavior, analytics hooks, route stability, and implementation-truthful claims.

## Goals / Non-Goals

**Goals:**
- Create one shared public marketing module catalog that can drive nav, homepage, platform overview, product discovery, and module destination pages.
- Expand the public module portfolio to include the newer implemented modules without reintroducing hard-coded module lists in multiple files.
- Keep module and plan claims grounded in existing entitlement and implementation status sources.
- Reuse shared page-building patterns so new module pages are consistent but still allow module-specific positioning copy.

**Non-Goals:**
- No changes to subscription entitlements, billing behavior, or dashboard access rules.
- No changes to legal meaning on privacy, terms, cookies, or compliance pages beyond cross-linking or navigation consistency.
- No new analytics vendor or tracking framework.
- No attempt to market scaffolded or non-public capabilities as shipped modules.

## Decisions

### Decision: Introduce a shared public module catalog for marketing surfaces
Create a single source of truth for public module marketing metadata, likely by extending the existing marketing content layer rather than keeping separate arrays in nav, footer, homepage, and platform pages.

Rationale:
- The current four-module limit exists because several surfaces duplicate the same list.
- A shared catalog lets the implementation add or hide a public module once and have every portfolio surface stay aligned.
- This is the smallest structural change that directly addresses the drift identified in the current codebase.

Alternatives considered:
- Keep per-page hard-coded module arrays: rejected because that is the current failure mode.
- Create a database-backed CMS model: rejected because the site already uses repo-managed content and this change does not require runtime editing.

### Decision: Use a shared module-page composition pattern with module-specific content
Implement dedicated module pages for the expanded set using a shared composition pattern or reusable section components, with per-module copy/config in the catalog.

Rationale:
- The site needs more module destinations, but the structure of those pages is similar: problem, workflow, outcomes, related modules, and CTA.
- A shared template keeps the module portfolio coherent and reduces maintenance cost.
- Per-module config preserves enough flexibility to avoid a bland one-size-fits-all page.

Alternatives considered:
- Hand-build every new module page independently: rejected because it scales poorly and invites drift in CTA, metadata, and internal linking.
- Collapse all new modules into one long platform page only: rejected because the request explicitly asks to redo marketing pages to include the new modules.

### Decision: Derive pricing/module inclusion messaging from canonical plan utilities
Public pricing and plan-comparison copy should be built from the canonical plan catalog and feature checks already used elsewhere, adding any lightweight presentation helpers needed for module grouping.

Rationale:
- The repo already treats `lib/subscriptionPlans.ts` as the source of truth.
- Marketing copy about plan/module availability is a recurring drift point, so duplicating that logic again would recreate the same bug class.
- Lightweight presentation helpers are sufficient; this does not require changing billing behavior.

Alternatives considered:
- Manually author a marketing-only pricing matrix: rejected because it will drift from entitlements.
- Surface every individual feature flag directly in page components: rejected because that couples marketing UI too tightly to low-level entitlement details.

### Decision: Model public visibility separately from implementation status phrasing
The marketing catalog should be able to represent whether a module is publicly marketed and whether related sub-capabilities must be labelled as planned or contact-only.

Rationale:
- Some modules are public and implemented, while some adjacent capabilities under those modules may still be planned.
- The user request is to include new modules, not to flatten all nuance into a single live/planned boolean.
- This supports truthful module pages without blocking publication on smaller planned sub-features.

Alternatives considered:
- Treat every module as fully live with no status metadata: rejected because it increases overstatement risk.
- Omit status metadata and rely on ad hoc copy review in each page: rejected because it does not scale.

## Risks / Trade-offs

- [Risk] More modules in the main marketing nav can overwhelm visitors. -> Mitigation: keep primary nav grouped, use a product index/overview layer, and reserve deeper detail for module destinations.
- [Risk] Module pages may overstate sub-features that are only partially implemented. -> Mitigation: source claims from current product behavior, include planned labels where needed, and align copy review with `marketing-feature-claim-accuracy`.
- [Risk] Pricing copy can become too technical if it mirrors low-level feature flags. -> Mitigation: add presentation helpers that group entitlements into customer-readable module/value statements while still sourcing from canonical plan data.
- [Risk] A shared template can make all module pages feel interchangeable. -> Mitigation: keep shared structure, but allow module-specific accents, narratives, workflows, and related-module pairings.

## Migration Plan

1. Expand the shared marketing content model to represent the public module portfolio and any supporting grouping/status metadata.
2. Refactor shared marketing chrome and discovery surfaces to read from that catalog.
3. Add or rewrite the required module destination pages using the shared composition pattern.
4. Update pricing and plan-comparison surfaces to use canonical plan/module presentation helpers.
5. Verify metadata, sitemap coverage, and live-mode CTA behavior remain intact after the content-model expansion.

Rollback strategy: because this is a content and presentation restructure with stable routes, rollback is a standard code revert of the marketing-content and page changes.
