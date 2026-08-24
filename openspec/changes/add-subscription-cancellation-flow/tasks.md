## 1. Billing state persistence

- [x] 1.1 Add `subscriptionCancelAt` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.2 Generate a Prisma migration for the new cancellation date field
- [x] 1.3 Update `app/api/webhooks/stripe-billing/route.ts` to persist `subscriptionCancelAt` from `customer.subscription.updated` when Stripe marks a subscription to cancel at period end
- [x] 1.4 Clear `subscriptionCancelAt` in the billing webhook when the pending cancellation is removed or when `customer.subscription.deleted` finalizes the subscription end

## 2. Cancellation-specific billing route

- [x] 2.1 Create a dedicated cancellation route under `app/api/billing/` that authenticates the user and rejects unauthenticated requests with HTTP 401
- [x] 2.2 Resolve the active Stripe subscription for the current user without creating a Stripe customer when none exists
- [x] 2.3 Create a Stripe Billing Portal session using the `subscription_cancel` flow and an after-completion redirect back to Settings -> Subscription
- [x] 2.4 Return HTTP 400 for users without an active Stripe subscription, including trial-only accounts

## 3. Subscription settings UI and confirmation page

- [x] 3.1 Extend `app/dashboard/settings/subscription/page.tsx` to load and pass `subscriptionCancelAt` and any return-state message flags to the client component
- [x] 3.2 Update `components/settings/SubscriptionClient.tsx` to show an explicit `Cancel subscription` action only for active paid subscriptions
- [x] 3.3 Update the current-plan card to show `Cancels on [date]` and supporting copy when `subscriptionCancelAt` is present
- [x] 3.4 Update the trial-only state to use `End free trial` wording and explain that no paid subscription is active yet
- [x] 3.5 Preserve the generic `Manage billing` entry point for non-cancellation billing tasks
- [x] 3.6 Add a dedicated subscription cancellation confirmation page that explains the impact and requires explicit confirmation before opening Stripe
- [x] 3.7 Wire the `Cancel subscription` action to navigate to the confirmation page instead of immediately calling the cancellation API

## 4. Verification

- [x] 4.1 Add or update tests covering the cancellation route success case, unauthenticated rejection, and no-active-subscription rejection
- [x] 4.2 Add or update tests covering webhook persistence and clearing of `subscriptionCancelAt`
- [x] 4.3 Add or update tests for subscription settings rendering of active, trial-only, and `Cancels on [date]` states
- [x] 4.4 Run `npm run test`
- [x] 4.5 Run `openspec validate add-subscription-cancellation-flow --type change --strict`
- [ ] 4.6 Verify the Stripe customer portal configuration is set to cancel subscriptions at period end, not immediately