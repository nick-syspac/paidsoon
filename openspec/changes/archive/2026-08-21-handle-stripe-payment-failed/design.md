## Context

`app/api/webhooks/stripe-billing/route.ts` currently switches on
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, and `subscription_schedule.released` — it
has no `invoice.payment_failed` case. `UserProfile.subscriptionStatus`
already models `"past_due"` in its schema comment
(`'active' | 'trialing' | 'cancelled' | 'past_due'`), and
`.github/instructions/billing.instructions.md` already documents the
intended policy: *"If `subscriptionStatus` becomes `past_due`, features
remain available until the subscription is actually cancelled (grace
period is Stripe's responsibility)."* See proposal.md - Why.

An earlier, functionally-identical proposal
(`openspec/changes/archive/2026-06-21-handle-billing-payment-failed-webhook`)
described this exact fix but was archived without a `design.md`/`tasks.md`
and without the handler ever landing in code — treat that archive as
historical context only, not as prior art to reconcile against.

## Goals / Non-Goals

**Goals:**
- Reflect a failed renewal payment in `UserProfile.subscriptionStatus`
  immediately, without waiting for a possible later
  `customer.subscription.updated` event.
- Keep behavior consistent with the documented grace-period policy: no
  feature-access change on `past_due` alone.

**Non-Goals:**
- Building dunning emails, in-app billing-issue banners, or any new
  user-facing notification — the account settings UI already renders a
  `"Past Due"` label from `subscriptionStatus` (`AccountSettingsClient.tsx`),
  which is sufficient for this change's scope.
- Changing how `customer.subscription.updated`/`.deleted` resolve tier or
  status — those handlers are unaffected.

## Decisions

- Look up the `UserProfile` by the failed invoice's Stripe customer ID
  (`invoice.customer`), matching the lookup pattern already used by
  `customer.subscription.updated`/`.deleted` (`stripeCustomerId` match),
  rather than introducing a new correlation mechanism.
- Set only `subscriptionStatus = "past_due"`; do not touch
  `subscriptionTier`, `stripeSubscriptionId`, or period fields. This
  mirrors the archived proposal's original scope and matches the
  instructions file's explicit rule not to downgrade tier without an
  explicit cancellation event.
  Alternative considered: also flip the tier down immediately on payment
  failure (the audit's literal wording, "gates access per the Stripe
  event") — rejected because it directly contradicts the repo's own
  documented billing policy and would revoke paid access before the grace
  period Stripe itself allows.
- Return `200` for `invoice.payment_failed` events with no matching
  `UserProfile` (e.g. a stale/test customer), consistent with the existing
  convention of never returning 4xx for events the app chooses not to act
  on.

## Risks / Trade-offs

- [Risk] Stripe may fire `invoice.payment_failed` for invoices unrelated to
  subscription renewal (e.g., a one-off invoice, if ever introduced) →
  Mitigation: out of scope today since PaidSoon has no non-subscription
  Stripe invoices; the customer-ID lookup only ever matches a
  `UserProfile.stripeCustomerId`, so no unrelated updates occur.
- [Risk] `customer.subscription.updated` may also independently transition
  `subscriptionStatus` to `"past_due"` shortly after this handler runs,
  making the two handlers' writes overlap → Mitigation: both handlers write
  the same value in that case (idempotent), so no conflict occurs; this
  handler exists to close the window before that second event arrives.
