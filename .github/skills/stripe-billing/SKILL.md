# Skill: Stripe Billing — PaidSoon

## When to Use This Skill
Use when working with Stripe subscription billing, Checkout, Customer Portal, or billing webhooks in PaidSoon.

## Status
Confirmed implemented (Stripe `22.1.1`, API `2026-05-27.dahlia`, 3 public tiers + 1 hidden contact-only tier).

## Inputs Required
- Which billing capability to work on (checkout, portal, webhook, feature gate)

## Files to Inspect
- `app/api/billing/checkout/route.ts` — Checkout session
- `app/api/billing/portal/route.ts` — Customer Portal link
- `app/api/webhooks/stripe-billing/route.ts` — billing webhook handler
- `lib/billing.ts` — `hasPlanFeature`, `requireFeature`, `getInvoiceLimitForTier`
- `lib/subscriptionPlans.ts` — plan catalog (source of truth)
- `prisma/schema.prisma` — `UserProfile.subscriptionTier`, `subscriptionStatus`

## Stripe Client Setup

```ts
import Stripe from "stripe"
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",  // Do NOT change this
})
```

## Plan Tier to Price ID Mapping

| Tier | Env Var |
|---|---|
| `starter` | `STRIPE_STARTER_PRICE_ID` |
| `solo` | `STRIPE_SOLO_PRICE_ID` |
| `small_business` | `STRIPE_SMALL_BUSINESS_PRICE_ID` |
| `accountant_partner` | none — contact-us pricing, no Stripe Checkout |

No legacy tier aliasing — `normalizeSubscriptionTier` falls back to `starter` for any
unrecognised value. `STRIPE_BUSINESS_PRICE_ID` and `STRIPE_PRO_PRICE_ID` are retired.

## Checkout Pattern

```ts
const session = await stripe.checkout.sessions.create({
  customer: userProfile.stripeCustomerId ?? undefined,
  mode: "subscription",
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  metadata: { userId: user.id, selectedTier: tier },
})
```

## Webhook Handling

```ts
// Always verify signature first
const sig = req.headers.get("stripe-signature")!
const event = stripe.webhooks.constructEvent(
  await req.arrayBuffer(),  // raw bytes
  sig,
  process.env.STRIPE_BILLING_WEBHOOK_SECRET!
)
```

Handled events:
- `checkout.session.completed` → update `subscriptionTier`
- `customer.subscription.updated` → update tier + status
- `customer.subscription.deleted` → downgrade to `starter`

## Feature Checks

```ts
import { hasPlanFeature, requireFeature } from "@/lib/billing"

// In route handler:
await requireFeature(user.id, "custom_reply_to")  // Throws 403 if not entitled

// In component:
if (!hasPlanFeature(userTier, "payment_status_dashboard")) {
  return <UpgradeBanner />
}
```

## Rules to Follow
- Never change the Stripe API version string
- Webhook signature MUST be verified before processing
- Use `STRIPE_BILLING_WEBHOOK_SECRET` (not Connect secret) for billing webhooks
- All webhook DB writes use `prismaAdmin`
- Make webhook handlers idempotent
- Return `200` for unhandled event types
- Never downgrade tier without a Stripe webhook event

## Common Mistakes to Avoid
- Parsing JSON before verifying webhook signature (must read raw bytes)
- Using billing webhook secret for Connect events (and vice versa)
- Changing API version string
- Not returning `200` for unknown event types (Stripe will retry)
- Synchronously downgrading tier based on payment failure (wait for Stripe event)

## Output Format
- Route handlers with signature verification
- `lib/subscriptionPlans.ts` updated (if plan changed)
- Tests with mock Stripe events

## Acceptance Checklist
- [ ] Webhook signature verified before processing
- [ ] API version `"2026-05-27.dahlia"` unchanged
- [ ] Correct webhook secret used
- [ ] Handlers idempotent
- [ ] `npm run test` passes
- [ ] No real Stripe API calls in tests
