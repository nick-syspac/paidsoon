## Why

Plan switching for existing subscribers is silently broken: the "Switch to X" button routes all users through Stripe Checkout, which creates a second subscription rather than modifying the existing one. Additionally, users have no visibility into when a downgrade takes effect — Stripe's default period-end scheduling happens invisibly, leaving users unaware their plan will change. This change fixes the execution path and introduces a transparent downgrade confirmation flow.

## What Changes

- Add four new fields to `UserProfile`: `stripeSubscriptionId`, `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, `stripeScheduleId`.
- Update the billing webhook to persist these fields on `checkout.session.completed` and `customer.subscription.updated`; clear pending fields when a scheduled change executes or is cancelled.
- **Fix upgrade path for existing subscribers:** `POST /api/billing/checkout` now detects an existing subscription and calls `stripe.subscriptions.update()` with `proration_behavior: 'create_prorations'` instead of creating a new Checkout session.
- **New `POST /api/billing/downgrade`:** schedules a period-end downgrade using Stripe Subscription Schedules; persists `pendingDowngradeTier` and `stripeScheduleId` to DB.
- **New `DELETE /api/billing/downgrade`:** releases the Subscription Schedule, cancelling the pending downgrade; clears pending fields in DB.
- Update `app/dashboard/settings/subscription/page.tsx` to pass `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, and `pendingDowngradeAt` to the client component.
- Redesign `SubscriptionClient.tsx`:
  - Show "Renews [date]" on the current plan card.
  - Detect upgrade vs downgrade based on `PLAN_ORDER`.
  - For downgrades: show an inline confirmation panel with the effective date and a data-driven "features you will lose" diff (computed from `PLAN_CATALOG`).
  - For upgrades on existing subscriptions: call the updated checkout route (UX unchanged, execution fixed).
  - Show a "Scheduled downgrade" state on the current plan card when `pendingDowngradeTier` is set, with a "Cancel" button.

## Capabilities

### New Capabilities

- `subscription-downgrade-scheduling`: Schedule a plan downgrade to take effect at the end of the current billing period, using Stripe Subscription Schedules. User sees the effective date and a diff of features they will lose before confirming.
- `subscription-downgrade-cancellation`: Cancel a pending scheduled downgrade before it takes effect, restoring the subscription to its current plan with no interruption.

### Modified Capabilities

- `subscription-plan-tiers`: The plan switching flow changes for existing subscribers — upgrades now use `subscriptions.update` (immediate, with proration) and downgrades use Subscription Schedules (period-end). The tier catalog, pricing, and feature flags are unchanged.

## Impact

**Code:**
- `prisma/schema.prisma` — four new fields on `UserProfile`
- `prisma/rls-policies.sql` — no new tables; existing UserProfile policies unchanged
- `app/api/billing/checkout/route.ts` — updated: use `subscriptions.update` when `stripeSubscriptionId` exists
- `app/api/billing/downgrade/route.ts` — new file (POST + DELETE handlers)
- `app/api/webhooks/stripe-billing/route.ts` — persist new fields; handle schedule execution and release
- `app/dashboard/settings/subscription/page.tsx` — pass new fields to client
- `components/settings/SubscriptionClient.tsx` — major UI update

**Stripe APIs used (new):**
- `stripe.subscriptionSchedules.create()`
- `stripe.subscriptionSchedules.update()`
- `stripe.subscriptionSchedules.release()`
- `stripe.subscriptions.update()` (existing but not previously used for plan switching)

**New webhook events to handle:**
- `customer.subscription_schedule.released` — clear pending downgrade state

**DB migration required:**
- `add-subscription-plan-switching-fields`

**No changes to:**
- `lib/subscriptionPlans.ts` — plan catalog, pricing, feature flags unchanged
- Stripe Connect or invoice-related routes
- Email sending pipeline
