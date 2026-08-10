## 1. Database

- [x] 1.1 Add `stripeSubscriptionId String? @map("stripe_subscription_id")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.2 Add `subscriptionCurrentPeriodEnd DateTime? @map("subscription_current_period_end")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.3 Add `pendingDowngradeTier String? @map("pending_downgrade_tier")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.4 Add `stripeScheduleId String? @map("stripe_schedule_id")` to `UserProfile` in `prisma/schema.prisma`
- [x] 1.5 Run `npx prisma migrate dev --name add-subscription-plan-switching-fields`
- [x] 1.6 Run `npm run verify-rls` and confirm it passes (no new tables; existing policies cover all columns)

## 2. Billing webhook updates

- [x] 2.1 In `app/api/webhooks/stripe-billing/route.ts`, update `checkout.session.completed` handler to persist `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` (Unix timestamp → DateTime) from `session.subscription` (fetch subscription object to get `current_period_end`)
- [x] 2.2 Update `customer.subscription.updated` handler to persist `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` from the subscription object
- [x] 2.3 In `customer.subscription.updated`, clear `pendingDowngradeTier` and `stripeScheduleId` if the subscription's current price ID matches `pendingDowngradeTier`'s price (i.e. the schedule has executed and the tier change has landed)
- [x] 2.4 Add handler for `customer.subscription_schedule.released`: find profile by `stripeScheduleId`, set `pendingDowngradeTier` and `stripeScheduleId` to null

## 3. Upgrade fix — existing subscribers via subscriptions.update

- [x] 3.1 In `app/api/billing/checkout/route.ts`, after resolving the profile, check if `profile.stripeSubscriptionId` is set
- [x] 3.2 If subscription ID exists and the requested tier is higher than current tier (upgrade): call `stripe.subscriptions.update(subId, { items: [{ price: priceId }], proration_behavior: 'create_prorations' })` and return `{ url: successUrl }` (skip Checkout session creation)
- [x] 3.3 If subscription ID exists and the requested tier is lower (downgrade): return HTTP 400 with `{ error: "Use the downgrade endpoint" }` — the UI should never hit this path but guard it anyway
- [x] 3.4 If no subscription ID: existing Checkout session creation path (unchanged)

## 4. New downgrade route — POST /api/billing/downgrade

- [x] 4.1 Create `app/api/billing/downgrade/route.ts`
- [x] 4.2 Implement `POST` handler: authenticate user via `supabase.auth.getUser()`; return 401 if not authenticated
- [x] 4.3 Parse and validate body `{ tier: string }` with Zod; return 422 on invalid input
- [x] 4.4 Load `UserProfile`; return 400 if no `stripeCustomerId` or no subscription
- [x] 4.5 Resolve `stripeSubscriptionId`: use `profile.stripeSubscriptionId` if set; otherwise fetch via `stripe.customers.listSubscriptions(customerId, { status: 'active', limit: 1 })` and use `data[0].id`; return 400 if none found
- [x] 4.6 Validate the requested tier is a downgrade (lower `PLAN_ORDER` index than current tier); return 400 if not
- [x] 4.7 Resolve `currentPriceId` from the active subscription item and `newPriceId` from `PRICE_ID_BY_TIER`
- [x] 4.8 Call `stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })` to create a schedule from the current subscription
- [x] 4.9 Call `stripe.subscriptionSchedules.update(scheduleId, { phases: [{ items: [{ price: currentPriceId }], end_date: currentPeriodEnd }, { items: [{ price: newPriceId }] }] })`
- [x] 4.10 Write `pendingDowngradeTier` and `stripeScheduleId` to `UserProfile` via `withUserContext`
- [x] 4.11 Return HTTP 200 with `{ scheduledAt: <ISO string of current_period_end> }`
- [x] 4.12 Trigger an explicit user-facing notification when the downgrade is scheduled, stating that the plan change will take effect at the next renewal and that it can still be cancelled before then
- [x] 4.13 Wrap the Stripe API calls in try/catch; return HTTP 500 with `{ error: "Failed to schedule downgrade" }` on error (do not leak Stripe error details)

## 5. New cancel route — DELETE /api/billing/downgrade

- [x] 5.1 Implement `DELETE` handler in `app/api/billing/downgrade/route.ts`
- [x] 5.2 Authenticate user; return 401 if not authenticated
- [x] 5.3 Load `UserProfile`; return 400 if `stripeScheduleId` is null (no pending downgrade)
- [x] 5.4 Call `stripe.subscriptionSchedules.release(stripeScheduleId)`
- [x] 5.5 Clear `pendingDowngradeTier` and `stripeScheduleId` on `UserProfile` via `withUserContext`
- [x] 5.6 Return HTTP 200 with `{ cancelled: true }`
- [x] 5.7 Wrap in try/catch; return HTTP 500 on Stripe error

## 6. Subscription settings page (server)

- [x] 6.1 In `app/dashboard/settings/subscription/page.tsx`, extend the profile query to select `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, `stripeScheduleId`
- [x] 6.2 Pass the new fields to `SubscriptionClient` as props: `currentPeriodEnd: Date | null`, `pendingDowngradeTier: string | null`

## 7. SubscriptionClient UI

- [x] 7.1 Update the `SubscriptionClient` props interface to add `currentPeriodEnd: Date | null` and `pendingDowngradeTier: SubscriptionTier | null`
- [x] 7.2 Show "Renews [formatted date]" on the current plan card when `currentPeriodEnd` is set
- [x] 7.3 Add state: `confirmingDowngradeTo: SubscriptionTier | null` (null = no confirmation panel open)
- [x] 7.4 In the plan button click handler, detect downgrade (`PLAN_ORDER.indexOf(selected) < PLAN_ORDER.indexOf(currentTier)`); if downgrade, set `confirmingDowngradeTo` instead of calling the API
- [x] 7.5 Render the inline confirmation panel when `confirmingDowngradeTo` is set, showing: target plan name, effective date (from `currentPeriodEnd`), lost features diff, "Confirm downgrade" and "Keep current plan" buttons
- [x] 7.6 Compute lost features diff: boolean features where current is `true` and target is `false`; limit reductions formatted as "N → M"
- [x] 7.7 "Keep current plan" dismisses the panel (`setConfirmingDowngradeTo(null)`)
- [x] 7.8 "Confirm downgrade" calls `POST /api/billing/downgrade` with the target tier; on success, update local state to reflect pending downgrade
- [x] 7.9 Show "Downgrading to [plan] on [date]" on the current plan card when `pendingDowngradeTier` is set (from props, updated by local state after confirmation)
- [x] 7.10 Show "Cancel scheduled downgrade" button on the current plan card when pending; on click, call `DELETE /api/billing/downgrade` and clear local pending state on success

## 8. Verification

- [x] 8.1 Run `npm run test` — confirm existing tests pass
- [x] 8.2 Run `npm run verify-rls`
- [ ] 8.3 Register `customer.subscription_schedule.released` in Stripe webhook dashboard (add to the production endpoint's listened events)
- [ ] 8.4 Manual smoke test: subscribe as a new user via Checkout; confirm `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` are written to `user_profiles`
- [ ] 8.5 Manual smoke test: downgrade from Small Business to Starter; confirm confirmation panel shows correct date and lost features; confirm Subscription Schedule created in Stripe dashboard
- [ ] 8.6 Manual smoke test: cancel the pending downgrade; confirm schedule released in Stripe and pending state cleared in DB
- [ ] 8.7 Manual smoke test: upgrade from Starter to Solo on an existing subscription; confirm no second subscription created; confirm proration charge in Stripe
- [ ] 1.2 Add `subscriptionCurrentPeriodEnd DateTime? @map("subscription_current_period_end")` to `UserProfile` in `prisma/schema.prisma`
- [ ] 1.3 Add `pendingDowngradeTier String? @map("pending_downgrade_tier")` to `UserProfile` in `prisma/schema.prisma`
- [ ] 1.4 Add `stripeScheduleId String? @map("stripe_schedule_id")` to `UserProfile` in `prisma/schema.prisma`
- [ ] 1.5 Run `npx prisma migrate dev --name add-subscription-plan-switching-fields`
- [ ] 1.6 Run `npm run verify-rls` and confirm it passes (no new tables; existing policies cover all columns)

## 2. Billing webhook updates

- [ ] 2.1 In `app/api/webhooks/stripe-billing/route.ts`, update `checkout.session.completed` handler to persist `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` (Unix timestamp → DateTime) from `session.subscription` (fetch subscription object to get `current_period_end`)
- [ ] 2.2 Update `customer.subscription.updated` handler to persist `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` from the subscription object
- [ ] 2.3 In `customer.subscription.updated`, clear `pendingDowngradeTier` and `stripeScheduleId` if the subscription's current price ID matches `pendingDowngradeTier`'s price (i.e. the schedule has executed and the tier change has landed)
- [ ] 2.4 Add handler for `customer.subscription_schedule.released`: find profile by `stripeScheduleId`, set `pendingDowngradeTier` and `stripeScheduleId` to null

## 3. Upgrade fix — existing subscribers via subscriptions.update

- [ ] 3.1 In `app/api/billing/checkout/route.ts`, after resolving the profile, check if `profile.stripeSubscriptionId` is set
- [ ] 3.2 If subscription ID exists and the requested tier is higher than current tier (upgrade): call `stripe.subscriptions.update(subId, { items: [{ price: priceId }], proration_behavior: 'create_prorations' })` and return `{ url: successUrl }` (skip Checkout session creation)
- [ ] 3.3 If subscription ID exists and the requested tier is lower (downgrade): return HTTP 400 with `{ error: "Use the downgrade endpoint" }` — the UI should never hit this path but guard it anyway
- [ ] 3.4 If no subscription ID: existing Checkout session creation path (unchanged)

## 4. New downgrade route — POST /api/billing/downgrade

- [ ] 4.1 Create `app/api/billing/downgrade/route.ts`
- [ ] 4.2 Implement `POST` handler: authenticate user via `supabase.auth.getUser()`; return 401 if not authenticated
- [ ] 4.3 Parse and validate body `{ tier: string }` with Zod; return 422 on invalid input
- [ ] 4.4 Load `UserProfile`; return 400 if no `stripeCustomerId` or no subscription
- [ ] 4.5 Resolve `stripeSubscriptionId`: use `profile.stripeSubscriptionId` if set; otherwise fetch via `stripe.customers.listSubscriptions(customerId, { status: 'active', limit: 1 })` and use `data[0].id`; return 400 if none found
- [ ] 4.6 Validate the requested tier is a downgrade (lower `PLAN_ORDER` index than current tier); return 400 if not
- [ ] 4.7 Resolve `currentPriceId` from the active subscription item and `newPriceId` from `PRICE_ID_BY_TIER`
- [ ] 4.8 Call `stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })` to create a schedule from the current subscription
- [ ] 4.9 Call `stripe.subscriptionSchedules.update(scheduleId, { phases: [{ items: [{ price: currentPriceId }], end_date: currentPeriodEnd }, { items: [{ price: newPriceId }] }] })`
- [ ] 4.10 Write `pendingDowngradeTier` and `stripeScheduleId` to `UserProfile` via `withUserContext`
- [ ] 4.11 Return HTTP 200 with `{ scheduledAt: <ISO string of current_period_end> }`
- [ ] 4.12 Wrap the Stripe API calls in try/catch; return HTTP 500 with `{ error: "Failed to schedule downgrade" }` on error (do not leak Stripe error details)

## 5. New cancel route — DELETE /api/billing/downgrade

- [ ] 5.1 Implement `DELETE` handler in `app/api/billing/downgrade/route.ts`
- [ ] 5.2 Authenticate user; return 401 if not authenticated
- [ ] 5.3 Load `UserProfile`; return 400 if `stripeScheduleId` is null (no pending downgrade)
- [ ] 5.4 Call `stripe.subscriptionSchedules.release(stripeScheduleId)`
- [ ] 5.5 Clear `pendingDowngradeTier` and `stripeScheduleId` on `UserProfile` via `withUserContext`
- [ ] 5.6 Return HTTP 200 with `{ cancelled: true }`
- [ ] 5.7 Wrap in try/catch; return HTTP 500 on Stripe error

## 6. Subscription settings page (server)

- [ ] 6.1 In `app/dashboard/settings/subscription/page.tsx`, extend the profile query to select `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, `stripeScheduleId`
- [ ] 6.2 Pass the new fields to `SubscriptionClient` as props: `currentPeriodEnd: Date | null`, `pendingDowngradeTier: string | null`

## 7. SubscriptionClient UI

- [ ] 7.1 Update the `SubscriptionClient` props interface to add `currentPeriodEnd: Date | null` and `pendingDowngradeTier: SubscriptionTier | null`
- [ ] 7.2 Show "Renews [formatted date]" on the current plan card when `currentPeriodEnd` is set
- [ ] 7.3 Add state: `confirmingDowngradeTo: SubscriptionTier | null` (null = no confirmation panel open)
- [ ] 7.4 In the plan button click handler, detect downgrade (`PLAN_ORDER.indexOf(selected) < PLAN_ORDER.indexOf(currentTier)`); if downgrade, set `confirmingDowngradeTo` instead of calling the API
- [ ] 7.5 Render the inline confirmation panel when `confirmingDowngradeTo` is set, showing: target plan name, effective date (from `currentPeriodEnd`), lost features diff, "Confirm downgrade" and "Keep current plan" buttons
- [ ] 7.6 Compute lost features diff: boolean features where current is `true` and target is `false`; limit reductions formatted as "N → M"
- [ ] 7.7 "Keep current plan" dismisses the panel (`setConfirmingDowngradeTo(null)`)
- [ ] 7.8 "Confirm downgrade" calls `POST /api/billing/downgrade` with the target tier; on success, update local state to reflect pending downgrade
- [ ] 7.9 Show "Downgrading to [plan] on [date]" on the current plan card when `pendingDowngradeTier` is set (from props, updated by local state after confirmation)
- [ ] 7.10 Show "Cancel scheduled downgrade" button on the current plan card when pending; on click, call `DELETE /api/billing/downgrade` and clear local pending state on success

## 8. Verification

- [ ] 8.1 Run `npm run test` — confirm existing tests pass
- [ ] 8.2 Run `npm run verify-rls`
- [ ] 8.3 Register `customer.subscription_schedule.released` in Stripe webhook dashboard (add to the production endpoint's listened events)
- [ ] 8.4 Manual smoke test: subscribe as a new user via Checkout; confirm `stripeSubscriptionId` and `subscriptionCurrentPeriodEnd` are written to `user_profiles`
- [ ] 8.5 Manual smoke test: downgrade from Small Business to Starter; confirm confirmation panel shows correct date and lost features; confirm Subscription Schedule created in Stripe dashboard
- [ ] 8.6 Manual smoke test: cancel the pending downgrade; confirm schedule released in Stripe and pending state cleared in DB
- [ ] 8.7 Manual smoke test: upgrade from Starter to Solo on an existing subscription; confirm no second subscription created; confirm proration charge in Stripe
