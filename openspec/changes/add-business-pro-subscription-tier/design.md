## Context

See proposal.md - Why. PaidSoon currently uses `lib/subscriptionPlans.ts` as the canonical source for tier identity, public-plan ordering, limits, and feature flags. Billing routes map tiers to Stripe Price IDs and rely on `PLAN_ORDER` index comparisons for upgrade versus downgrade behavior. Marketing and settings surfaces render plan information from shared plan helpers.

Adding a new public tier affects any exhaustive `SubscriptionTier` mapping, any public-plan list rendering, and any route-level validation that enumerates allowable public tiers. The change must keep `accountant_partner` contact-only and preserve existing checkout/downgrade/webhook lifecycles.

## Goals / Non-Goals

**Goals:**
- Introduce `business_pro` as a canonical public tier at A$99/month.
- Keep tier behavior consistent across billing, onboarding, settings, marketing pricing, and webhook reconciliation.
- Add one canonical Stripe env var for Business Pro pricing and document it in runbooks.
- Preserve backward compatibility for existing subscribers and existing tier fallbacks.

**Non-Goals:**
- Reworking feature entitlements beyond adding the new tier profile.
- Introducing annual billing or changing Stripe API version behavior.
- Making `accountant_partner` self-serve or changing its contact-only status.

## Decisions

### Decision 1: Introduce Business Pro as a public tier between Small Business and Accountant Partner
- Decision: Insert `business_pro` into `PLAN_ORDER` between `small_business` and `accountant_partner`.
- Rationale: Maintains progressive upgrade ladder for all self-serve plans while keeping the contact-only plan excluded from public upsells.
- Alternatives considered:
- Append after `accountant_partner`: rejected because it would break index-based upgrade/downgrade semantics and expose a public plan above a contact-only tier.
- Replace `small_business`: rejected because it would be a breaking product packaging change.

### Decision 2: Add canonical env var `STRIPE_BUSINESS_PRO_PRICE_ID`
- Decision: Extend tier-to-price mappings in checkout, downgrade scheduling, and webhook price resolution with `STRIPE_BUSINESS_PRO_PRICE_ID`.
- Rationale: Keeps Stripe price lookup explicit and consistent with existing per-tier env-var model.
- Alternatives considered:
- Reuse legacy env var names: rejected due to prior retirement and ambiguity.
- Encode prices directly in code: rejected for security/operations reasons.

### Decision 3: Update all tier-enum and label surfaces as one atomic change
- Decision: Update route validation, label maps, and test fixtures that enumerate tiers in the same change.
- Rationale: Prevents partial rollouts where checkout accepts a tier but onboarding or UI rejects/displays it incorrectly.
- Alternatives considered:
- Phase rollout by area: rejected because this is a small, tightly coupled surface area and phased drift would create support issues.

## Risks / Trade-offs

- [Risk] Missing env var in an environment causes checkout/downgrade failures for Business Pro. -> Mitigation: runbook updates plus deployment checklist requiring `STRIPE_BUSINESS_PRO_PRICE_ID` across local/preview/prod.
- [Risk] Tier-order insertion could alter recommendation or downgrade behavior unexpectedly. -> Mitigation: update and run plan-order and upsell tests.
- [Risk] Marketing copy drift can omit Business Pro even when billing supports it. -> Mitigation: modify marketing claim-accuracy capability and pricing-page assertions.

## Migration Plan

1. Add `business_pro` to canonical plan catalog and plan order.
2. Add `STRIPE_BUSINESS_PRO_PRICE_ID` in billing route/webhook mappings.
3. Update onboarding tier validation and plan selection surfaces.
4. Update tier label maps and pricing-page presentation.
5. Update tests that assert tier sets/order and policy maps.
6. Update runbooks for the new env var and Stripe product setup.
7. Validate with focused tests and `openspec validate --strict`.

Rollback strategy: revert the change and remove the new env var from deployment configuration if tier launch is deferred.

## Open Questions

None.
