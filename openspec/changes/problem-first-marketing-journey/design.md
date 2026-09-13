## Context

See `proposal.md` for motivation. Current marketing surfaces expose deep module architecture too early in the visitor journey, with inconsistent CTA language and mixed beta-availability claims across homepage, module, and pricing content. Existing marketing capabilities already define shared module catalogs, plan-gating language, and feature-claim constraints, so this change should layer a stricter narrative order and shared copy taxonomy on top of those foundations rather than introducing independent parallel content systems.

## Goals / Non-Goals

**Goals:**
- Establish a reusable problem-first narrative model across homepage, platform overview, and module pages.
- Reduce first-view cognitive load by elevating outcome groups and deferring full module inventory.
- Standardize CTA phrases and intensity progression by page stage.
- Resolve private-beta messaging ambiguity with a canonical availability vocabulary.
- Add a pricing intent selector that recommends starting plans without diverging from canonical entitlement logic.

**Non-Goals:**
- Changing Stripe products, checkout paths, billing webhooks, or subscription entitlement rules.
- Rewriting core product logic or module internals.
- Launching public self-serve signup beyond the existing private-beta posture.
- Replacing established module brand names in deeper product-discovery pages.

## Decisions

1. Decision: Introduce a marketing journey contract as a shared content model.
Rationale: The core defect is sequencing and framing consistency, not isolated copy quality. A contract-level model (section order, CTA mapping, availability labels, outcome groups) prevents regressions when multiple pages evolve.
Alternatives considered:
- Page-by-page copy rewrites without shared contract: rejected due to high drift risk.
- Full CMS migration first: rejected as too large for this change scope.

2. Decision: Keep full module discoverability but move comprehensive module grid lower.
Rationale: Hiding modules entirely weakens platform credibility, while equal-weight top placement overwhelms first-time visitors. Progressive disclosure balances trust and comprehension.
Alternatives considered:
- Remove multi-module portfolio from homepage: rejected because users still need confidence in platform breadth.
- Keep current top-level nine-module grid: rejected because it preserves cognitive overload.

3. Decision: Define canonical CTA lexicon and map it to journey stages.
Rationale: Mixed labels (“Request access,” “Join waitlist,” “Contact us”) dilute intent. Stage-matched CTAs improve conversion clarity while supporting private-beta constraints.
Alternatives considered:
- Single CTA phrase everywhere: rejected because it underperforms for mid-funnel explanatory sections.
- Keep local page-owned CTA strings: rejected due to inconsistency risk.

4. Decision: Use explicit private-beta availability statuses across module and pricing surfaces.
Rationale: “Available now” can conflict with “private beta” framing and erode trust. Controlled status terms preserve confidence and truthfulness.
Alternatives considered:
- Keep mixed legacy labels with disclaimers: rejected for ambiguity.
- Hide availability labels entirely: rejected because visitors need readiness context.

5. Decision: Add pricing intent selector as a presentation layer over canonical plan data.
Rationale: Visitors need guidance on where to start, but recommendation logic must not fork entitlement truth from the canonical plan catalog.
Alternatives considered:
- Hard-coded recommendation copy detached from plan logic: rejected as drift-prone.
- No selector: rejected because this misses high-intent disambiguation.

## Risks / Trade-offs

- [Risk] Existing analytics events may not map cleanly to new section order and CTA names.
  → Mitigation: Introduce event aliasing/migration mapping for renamed CTAs and section anchors.

- [Risk] Outcome-led grouping might reduce direct discoverability for specific module seekers.
  → Mitigation: Preserve top navigation access to Solutions and module destinations with clear cross-links.

- [Risk] Copy centralization can create merge contention between marketing and product changes.
  → Mitigation: Isolate shared content constants by concern (journey, availability, CTA) and document ownership.

- [Risk] Pricing intent selector could imply guaranteed plan suitability.
  → Mitigation: Present recommendations as “starting points” and keep entitlement details explicit in comparison tables.

## Migration Plan

1. Add shared marketing journey constants (section order, CTA ladder, availability labels, outcome-group taxonomy).
2. Refactor homepage composition to enforce new sequence and simplified hero payload.
3. Add the accounting-software vs PaidSoon comparison block beneath hero.
4. Rework early module explanation into four-part control-cycle cards and move comprehensive module grouping lower.
5. Update platform overview structure to mirror the control-cycle-first narrative.
6. Update module destination templates/content blocks to follow problem-action-fit-plan answer order and ending CTA.
7. Add pricing intent selector and recommendation mapping using canonical plan catalog data.
8. Normalize CTA labels and beta messaging across homepage, platform, module, pricing, and footer surfaces.
9. Validate responsive behavior, navigation integrity, and content consistency.
10. Run lint/tests and perform manual acceptance review for journey order, CTA progression, and messaging consistency.

## Open Questions

None. This change will keep pricing intent recommendations session-local and retain analytics compatibility via legacy event aliases during rollout.