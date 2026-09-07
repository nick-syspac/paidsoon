## 1. Canonical Tier Model Update

- [ ] 1.1 Add `business_pro` to the `SubscriptionTier` union and canonical plan catalog with name `Business Pro`, public visibility, and `monthlyPriceAud: 99`.
- [ ] 1.2 Insert `business_pro` into `PLAN_ORDER` between `small_business` and `accountant_partner`.
- [ ] 1.3 Define Business Pro limits and feature flags in `PLAN_CATALOG` and ensure helper functions (`getPublicPlans`, `normalizeSubscriptionTier`, `resolvePlanSelectorTier`) remain correct.

## 2. Billing Route and Webhook Wiring

- [ ] 2.1 Add `STRIPE_BUSINESS_PRO_PRICE_ID` to tier-to-price maps in `POST /api/billing/checkout` and `POST /api/billing/downgrade`.
- [ ] 2.2 Extend billing webhook price-to-tier resolution so `customer.subscription.updated` maps Business Pro price IDs to `business_pro`.
- [ ] 2.3 Verify upgrade/downgrade path behavior still uses `PLAN_ORDER` index semantics after the new tier insertion.

## 3. Public Flow and Presentation Updates

- [ ] 3.1 Update onboarding tier validation to accept `business_pro` as a valid public tier.
- [ ] 3.2 Update marketing pricing page to include Business Pro in plan cards, CTA labels, and comparison rendering.
- [ ] 3.3 Update plan/tagline presentation and dashboard/admin/user tier label maps to render `Business Pro` consistently.

## 4. Tier-Dependent Policy and Test Coverage

- [ ] 4.1 Update exhaustive tier maps (for example AI rewrite guardrail policy) to include `business_pro`.
- [ ] 4.2 Update unit tests for plan catalog pricing, plan ordering, onboarding/checkouts tier validation, and upsell recommendation ladder.
- [ ] 4.3 Update Stripe billing webhook tests to include Business Pro price ID env setup where tier maps are validated.

## 5. Operations Documentation

- [ ] 5.1 Add `STRIPE_BUSINESS_PRO_PRICE_ID` to environment variable matrices and “where consumed” sections in runbooks.
- [ ] 5.2 Update Stripe setup runbook tier-pricing instructions to include creating the Business Pro A$99 inclusive-tax Price.

## 6. Validation and Rollout Safety

- [ ] 6.1 Run focused tests covering subscription plans, onboarding tier validation, and upsell tier recommendation behavior.
- [ ] 6.2 Run `openspec validate add-business-pro-subscription-tier --type change --strict` and resolve any schema issues.
- [ ] 6.3 Confirm deployment checklist requires `STRIPE_BUSINESS_PRO_PRICE_ID` in local, preview, and production environments before launch.
