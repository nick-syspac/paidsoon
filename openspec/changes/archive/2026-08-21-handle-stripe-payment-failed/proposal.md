## Why

The Stripe billing webhook (`app/api/webhooks/stripe-billing/route.ts`)
does not handle `invoice.payment_failed`. A user whose renewal charge fails
stays recorded as `subscriptionStatus: "active"` until (if ever) Stripe
eventually fires `customer.subscription.deleted`, so the account settings
UI and any future dunning logic have no immediate signal that a payment
failed. Flagged as release blocker B-3 in `docs/go-live-to-do.md`.

Note: an earlier proposal for this exact gap
(`openspec/changes/archive/2026-06-21-handle-billing-payment-failed-webhook`)
was archived without ever being implemented — the handler it described does
not exist in the current webhook route. This change supersedes it.

## What Changes

- Add a `case "invoice.payment_failed":` branch to the `stripe-billing`
  webhook that looks up the `UserProfile` by the failed invoice's Stripe
  customer ID and sets `subscriptionStatus = "past_due"`.
- Per `.github/instructions/billing.instructions.md`'s existing
  "Subscription Status Rules", `subscriptionTier` is left unchanged — a
  `past_due` user keeps their current tier's feature access during the
  grace period; only an explicit `customer.subscription.deleted` event
  revokes access. This change does not alter that gating behavior.
- Add a route-level test for the `stripe-billing` webhook covering
  `invoice.payment_failed` (this webhook currently has no dedicated test
  file).

## Capabilities

### New Capabilities
- `subscription-payment-failure-handling`: defines how a failed Stripe
  renewal invoice is reflected in `UserProfile.subscriptionStatus` without
  affecting feature-gating tier.

### Modified Capabilities
(none)

## Impact

- `app/api/webhooks/stripe-billing/route.ts`
- `tests/` (new route-level test file)
- `docs/DDD.md`, `docs/HLD.md` (both currently document this as "not
  implemented" — update once shipped)
