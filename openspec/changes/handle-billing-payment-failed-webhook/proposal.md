## Why

The Stripe Billing webhook in [app/api/webhooks/stripe-billing/route.ts](../../../app/api/webhooks/stripe-billing/route.ts) handles `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. It does **not** handle `invoice.payment_failed`, even though the event is listed as required in the production webhook subscription (per [docs/runbooks/stripe.md §5.1](../../../docs/runbooks/stripe.md)).

Without a handler, a user whose monthly Pro charge fails stays marked as `subscriptionStatus: "active"` until the eventual `customer.subscription.deleted` event fires (typically after ~30 days of dunning). During that window the dashboard does not reflect that the user's payment is failing, which is bad UX and bad cash-flow visibility.

This change wires up the handler so failed charges are reflected immediately.

## What Changes

- Add a `case "invoice.payment_failed":` branch in [stripe-billing route](../../../app/api/webhooks/stripe-billing/route.ts) that:
  - Looks up the `userProfile` by `stripeCustomerId` from the failed invoice's customer.
  - Sets `subscriptionStatus = "past_due"`.
  - (Leaves `subscriptionTier` as-is — the user keeps Pro access during the grace period; revocation still happens on `subscription.deleted`.)
- Update [docs/runbooks/stripe.md §5.1](../../../docs/runbooks/stripe.md) to remove the "not yet handled in code" note next to `invoice.payment_failed`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None at the spec layer — `subscriptionStatus` is an existing field on `UserProfile`. The change is implementation-only.

## Impact

- **Files changed**: `app/api/webhooks/stripe-billing/route.ts` (new switch branch); `docs/runbooks/stripe.md` (remove the deferred-handler note).
- **Env vars**: none.
- **Backwards compatibility**: subscribing to `invoice.payment_failed` is already in the production webhook config per the runbook, so deliveries are happening and being acknowledged with `{received: true}` today. Adding a handler just gives those deliveries effect.
- **Reference**: `build-environment-runbooks` design D6 documents this split.
