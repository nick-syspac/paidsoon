## Why

The subscription settings page currently offers only a generic billing-portal entry point, which hides the cancellation path for paid subscribers and misfits trial users who do not yet have a Stripe subscription to cancel. PaidSoon needs an explicit customer-facing cancellation flow that distinguishes between ending a free trial, cancelling a paid subscription in Stripe, and showing a clear pending-cancellation state after the user schedules the end of billing.

## What Changes

- Add an explicit cancellation action to the Settings -> Subscription tab.
- Load a dedicated confirmation page before sending paid subscribers with an active Stripe subscription into a Stripe Billing Portal `subscription_cancel` flow.
- Show a trial-specific `End free trial` state for users who are still in the DB-side free trial and do not yet have a Stripe subscription, while still letting them cancel through the same confirmation flow and end the trial locally.
- Persist and display scheduled cancellation state when Stripe marks a subscription to end at period end, including the preferred copy `Cancels on [date]` and a supporting explanation that access remains active until then.
- Add a return-state message after the Stripe cancellation flow so the settings page reflects the scheduled end date immediately.
- Prevent cancellation-specific routes from creating Stripe customers for trial-only accounts that have nothing to cancel.

## Capabilities

### New Capabilities
- `subscription-cancellation`: customer-facing cancellation behavior for paid subscriptions, trial-only accounts, a dedicated confirmation page, and pending period-end cancellation messaging in subscription settings

### Modified Capabilities
- `subscription-plan-tiers`: subscription settings must distinguish active, trialing, and scheduled-cancellation states when presenting the current plan card and related actions

## Impact

- `components/settings/SubscriptionClient.tsx` and `app/dashboard/settings/subscription/page.tsx` for new actions and state copy
- New or updated billing route(s) under `app/api/billing/` for cancellation-specific portal session creation and return handling
- `app/api/webhooks/stripe-billing/route.ts` and `prisma/schema.prisma` if pending cancellation dates or flags need to be stored locally
- Stripe Billing Portal configuration and deep-link flow usage (`subscription_cancel`)