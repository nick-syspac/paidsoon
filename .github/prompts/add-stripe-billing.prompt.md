---
mode: agent
description: Add or extend Stripe billing in PaidSoon.
---

# Add Stripe Billing — PaidSoon

## Role
You are a senior full-stack engineer working on Stripe billing integration in PaidSoon.

## Goal
Add or extend the Stripe billing integration in PaidSoon, including subscription management, webhooks, and entitlement checks.

> **Important:** Stripe billing is **already implemented** in PaidSoon. Before making changes, inspect existing code to understand what is already in place.

## PaidSoon Context
Stripe billing uses `stripe@22.1.1` with API version `"2026-05-27.dahlia"`. Three tiers: `starter`, `solo`, `small_business`. Checkout, customer portal, and billing webhooks are all implemented.

## Files to Inspect
- `app/api/billing/checkout/route.ts` — Checkout session creation
- `app/api/billing/portal/route.ts` — Customer Portal link
- `app/api/webhooks/stripe-billing/route.ts` — Billing webhook handler
- `lib/billing.ts` — `hasPlanFeature`, `requireFeature`, `getInvoiceLimitForTier`
- `lib/subscriptionPlans.ts` — plan catalog (source of truth for features)
- `prisma/schema.prisma` — `UserProfile` with `subscriptionTier`, `subscriptionStatus`
- `docs/runbooks/stripe.md` — Stripe setup runbook

## Stripe API Version

```ts
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
})
```

Do NOT change the API version. It must match the installed `stripe@22.1.1` type definitions.

## Adding a New Plan or Feature

1. Add the feature flag to `lib/subscriptionPlans.ts` in the `PLAN_CATALOG`.
2. Update `hasPlanFeature` type if needed.
3. Add the `requireFeature` check in the relevant route handler.
4. Add a test in `tests/subscription-plans.test.ts`.
5. Update `docs/DDD.md` with the new feature.

## Adding a New Tier

Do NOT add new tiers without explicit discussion. Adding a tier requires:
1. New Stripe Product + Price in the Stripe dashboard
2. New env var: `STRIPE_<TIER>_PRICE_ID`
3. Updated `lib/subscriptionPlans.ts`
4. Updated webhook handler to recognise the new tier
5. Updated `docs/DDD.md` and `docs/runbooks/stripe.md`

## Webhook Safety Rules

- Verify signature before processing: `stripe.webhooks.constructEvent(body, sig, secret)`
- Use `STRIPE_BILLING_WEBHOOK_SECRET` for billing events
- Return `200` for unhandled event types
- Return `400` for invalid signatures
- Use `prismaAdmin` in webhook handlers (RLS bypass, documented)
- Make all webhook handlers idempotent

## Checkout Pattern

```ts
const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId,  // reuse or create
  mode: "subscription",
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=1`,
  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  metadata: { userId: user.id, selectedTier: tier },
})
```

## Tests
- Test `hasPlanFeature` for all tier/feature combinations
- Test webhook handler with mocked Stripe events (do not call real Stripe)
- Test checkout route returns a URL

## Expected Output
1. Updated route/handler files
2. Updated `lib/subscriptionPlans.ts` (if feature changed)
3. Updated `prisma/rls-policies.sql` (if schema changed)
4. Tests in `tests/`
5. Updated docs

## Acceptance Criteria
- Webhook signature verified before processing
- No real Stripe API calls from tests
- `npm run test` passes
- No TypeScript errors
