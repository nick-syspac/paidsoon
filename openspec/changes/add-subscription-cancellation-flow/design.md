## Context

See proposal.md for motivation. The current subscription settings page uses a single `Manage billing` action that posts to `/api/billing/portal`, and that route creates a Stripe customer if one does not already exist. That behaviour is acceptable for generic billing management but incorrect for cancellation-specific intent because a trial-only account can have no paid subscription to cancel.

The existing billing webhook persists tier, status, and current billing period dates, but it does not store an explicit pending-cancellation date. The settings UI therefore has no durable local signal for a `Cancels on [date]` state after the user schedules a period-end cancellation in Stripe.

## Goals / Non-Goals

**Goals:**
- Add an explicit customer-facing cancellation path for active paid subscriptions.
- Keep trial-only accounts out of the Stripe cancellation flow.
- Persist enough billing state to render `Cancels on [date]` after Stripe schedules a period-end cancellation.
- Keep Stripe as the system of record for paid-subscription cancellation execution.

**Non-Goals:**
- Account deletion, workspace deletion, or broader data-retention workflows.
- Replacing the generic billing portal entry point for non-cancellation tasks.
- Supporting immediate subscription cancellation as the primary product path.

## Decisions

### D1: Use a dedicated confirmation page before the cancellation route

**Decision:** Add a dedicated confirmation page under Settings -> Subscription. The page explains what cancellation does, shows the pending end date / plan state, and only after explicit confirmation calls a cancellation-specific billing route that creates a Stripe Billing Portal session with `flow_data.type = "subscription_cancel"`.

**Rationale:** The generic portal route currently creates a Stripe customer when one is missing. Cancellation must not do that. A dedicated confirmation page improves clarity and gives the user a deliberate step before the Stripe handoff, while a dedicated route can still require an authenticated user with an active Stripe subscription and reject all other cases without side effects.

**Alternative considered:** Reuse `POST /api/billing/portal` with query params. Rejected because it preserves the wrong customer-creation behaviour and muddles generic billing access with cancellation intent.

### D2: Persist scheduled cancellation as a local date field

**Decision:** Add `subscriptionCancelAt DateTime?` to `UserProfile` and update it from Stripe webhook events.

**Rationale:** The UI needs a durable local source for the `Cancels on [date]` state after the user returns from Stripe and on later page loads. A nullable date is enough: when present, the subscription is pending period-end cancellation; when absent, it is not.

**Alternative considered:** Depend only on a return query parameter from Stripe. Rejected because the state would disappear on refresh and would drift from Stripe if the webhook updates later.

### D3: Treat Stripe webhook updates as the source of truth for pending cancellation

**Decision:** Update `subscriptionCancelAt` from `customer.subscription.updated` when Stripe reports a period-end cancellation and clear it when cancellation is removed or when the subscription is fully deleted.

**Rationale:** Stripe already owns the billing state transition. Persisting the date from webhooks keeps the app aligned with out-of-band changes made in Stripe and lets the settings page survive reloads.

**Alternative considered:** Persist the date only in the cancel route. Rejected because it would miss dashboard-side Stripe changes and would not clear reliably if the user later keeps the subscription.

### D4: Trialing users get an explicit local end-trial action

**Decision:** Trial-only accounts keep a cancellation affordance, but the flow ends the free trial locally instead of sending the user to Stripe. The confirmation page explains that there is no paid subscription yet and asks `Are you sure?` before the trial is ended.

**Rationale:** The product intent is to let the user stop using the product even while still in trial, but without forcing them through a Stripe cancellation flow that does not apply. Keeping the action local avoids creating a bogus Stripe customer while still preserving a clear confirmation step.

**Alternative considered:** Hide cancellation entirely until billing starts. Rejected because the user explicitly wants trial accounts to be able to cancel with an `are you sure` confirmation.

### D5: `Cancels on [date]` becomes the persistent pending-cancellation label

**Decision:** When `subscriptionCancelAt` is present, the current-plan card uses `Cancels on [date]` as the primary label and supporting copy that the subscription remains active until that date and will not renew afterward.

**Rationale:** This phrasing is more precise than `Cancelled` or `Cancellation scheduled` and makes the future effective date scannable in the main plan card.

## Risks / Trade-offs

**[Risk] Stripe portal configuration is set to immediate cancellation** -> The UI wording assumes the primary customer flow is period-end cancellation. Mitigation: configure the Stripe customer portal cancellation mode for end-of-period cancellation and verify it in manual smoke tests.

**[Risk] Webhook lag after the user returns from Stripe** -> The success return could arrive before the webhook persists `subscriptionCancelAt`. Mitigation: include a success query parameter for the immediate flash message, but rely on the webhook-backed field for the durable card state.

**[Trade-off] Ending a trial locally is not a Stripe-managed cancellation** -> The product owns the state transition for trial accounts. Mitigation: keep the state transition small, explicit, and reversible only through a new sign-up / new trial.

## Migration Plan

1. Add `subscriptionCancelAt` to `UserProfile` and generate a Prisma migration.
2. Update the billing webhook to persist and clear the field from Stripe subscription events.
3. Add the cancellation-specific billing route and Stripe return handling.
4. Update the subscription settings page and client UI to show the new lifecycle states and copy.
5. Verify Stripe portal configuration for period-end cancellation before production rollout.

## Open Questions

None.