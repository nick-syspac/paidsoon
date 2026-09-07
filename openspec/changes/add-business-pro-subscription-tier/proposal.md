## Why

PaidSoon needs a higher public tier for growing businesses that have outgrown Small Business limits but do not need a contact-only partnership plan. Adding Business Pro now closes a packaging gap and keeps pricing, checkout, and marketing claims aligned with real purchasable plans.

## What Changes

- Add a new public subscription tier `business_pro` named Business Pro at A$99/month (inclusive of GST) to the canonical plan catalog.
- Introduce a canonical Stripe price env var `STRIPE_BUSINESS_PRO_PRICE_ID` and wire it into billing checkout, downgrade scheduling, and webhook tier resolution.
- Update onboarding and plan-selection flows so `business_pro` is accepted as a valid self-serve plan choice.
- Update pricing and tier presentation surfaces to include Business Pro in the public plan ladder and customer-visible labels.
- Update quota/policy helpers and tests that depend on exhaustive `SubscriptionTier` mappings.
- Update runbook environment-variable documentation for the new Stripe price configuration.

## Capabilities

### New Capabilities
- `<none>`

### Modified Capabilities
- `subscription-plan-tiers`: expand canonical public tier set and plan-order behavior to include `business_pro` with A$99 pricing and self-serve eligibility.
- `marketing-feature-claim-accuracy`: require customer-facing pricing and tier naming surfaces to include Business Pro consistently and avoid stale three-tier copy.

## Impact

- Subscription source-of-truth and plan helper logic in `lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, and tier-dependent guardrail helpers.
- Billing APIs and webhook behavior in `app/api/billing/**` and `app/api/webhooks/stripe-billing/route.ts`.
- Customer-facing and admin tier display surfaces in marketing, dashboard settings, and admin customer pages.
- Test suites that assert plan ordering, allowed onboarding tiers, and tier-specific policies.
- Stripe and environment setup runbook docs for the new required env var.
