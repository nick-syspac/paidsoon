## Context

See proposal.md for motivation. `app/(marketing)/accountants/page.tsx` is a single static server component with three sections: multi-client management cards, an Accountant Partner Programme benefits list, and a bottom CTA. All copy is hardcoded JSX/arrays; there's no dynamic dependency on `lib/subscriptionPlans.ts` today, though `multi_client_management` already exists there as a feature flag permanently listed in `UNIMPLEMENTED_FEATURES`.

## Goals / Non-Goals

**Goals:**
- Stop the page from promising a live multi-client dashboard/onboarding flow that doesn't exist.
- Preserve the page's role as a lead-generation surface for the Accountant Partner programme (still worth having prospects register interest even pre-launch).
- Keep the existing, working "Contact us" enquiry routing untouched.

**Non-Goals:**
- Not building multi-client management itself — that's a separate, much larger product change if/when prioritized.
- Not removing the page entirely — reframing it, not deleting it.
- Not changing `lib/subscriptionPlans.ts` or the `accountant_partner` tier definition.

## Decisions

### D1. Reframe in place rather than gate behind `isFeatureImplemented`
Decision: Rewrite the specific overstated sections (multi-client management cards, "Unlimited clients"/"Multi-client debtor dashboard" bullets) to use planned/coming-soon framing, following the same "(coming soon)" convention `lib/subscriptionPlans.ts`'s `isFeatureImplemented` already establishes on `/pricing`, rather than importing the catalog helper onto this page.

Rationale: `/accountants` is prose-heavy narrative copy, not a tabular feature comparison — the `isFeatureImplemented`-driven suffix pattern fits `/pricing`'s table format well but would read awkwardly inline here. A hand-edit that follows the same *convention* (clearly labeling unimplemented things as planned) achieves the same accuracy goal without forcing an awkward integration.

Alternatives considered:
- Import `isFeatureImplemented("multi_client_management")` and conditionally render a "(coming soon)" badge next to each affected bullet: considered, kept as an option during implementation if it reads cleanly, but not mandated by this design since the page's prose structure differs from `/pricing`'s table.

### D2. Keep the page live as a registration-of-interest surface (not taken down)
Decision: The page stays published, reframed to invite interest rather than describing a working tool.

Rationale: Per the proposal's option (a), this preserves lead generation and SEO value for accountant/bookkeeper prospects while not overpromising. Taking the page down entirely would lose that funnel with no accuracy benefit beyond what reframing already achieves.

Alternatives considered:
- Take the page down until multi-client management ships: rejected — throws away a working, low-risk enquiry channel (`Accounting Partnerships` routing already works) for no additional accuracy benefit over reframing.

## Risks / Trade-offs

- [Risk] Softer copy could reduce partner enquiry conversion versus the current (overstated) version. -> Mitigation: keep the value proposition (why partner with PaidSoon at all) strong; only the "is this live today" framing changes, not the pitch itself.
- [Risk] If multi-client management ships later, this page will need a follow-up pass to re-promote claims from "planned" back to "available." -> Mitigation: same shared "(coming soon)" convention already used elsewhere in the codebase makes that a small, well-precedented follow-up edit.

## Migration Plan

1. Rewrite the multi-client management cards section to frame the capability as planned.
2. Rewrite the Accountant Partner Programme benefits list to qualify multi-client-specific bullets as planned/coming soon while keeping genuinely available benefits (dedicated onboarding support, priority support channel) as-is.
3. Update page `Metadata` description to drop the present-tense "manage... from one dashboard" phrasing.
4. Keep CTA links/routing unchanged.
5. Rollback: revert the copy commit; no other systems affected.
