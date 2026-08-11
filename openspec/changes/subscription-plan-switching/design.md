## Context

PaidSoon currently routes all plan switches through Stripe Checkout (`mode: "subscription"`), which works for new subscribers but silently creates a second subscription for existing ones. The Billing Portal is available via "Manage subscription" but provides no pre-warning UX. Users have no way to know a downgrade will happen at period end before confirming it.

The explore phase established:
- Four new `UserProfile` fields are needed: `stripeSubscriptionId`, `subscriptionCurrentPeriodEnd`, `pendingDowngradeTier`, `stripeScheduleId`.
- Stripe Subscription Schedules are the correct primitive for period-end downgrades.
- Upgrades for existing subscribers should use `subscriptions.update` (immediate, with proration).
- The "lost features" diff is fully derivable from `PLAN_CATALOG` — no hardcoding needed.
- A pending downgrade state must be surfaced in the UI with a cancel path.

## Goals / Non-Goals

**Goals:**
- Fix the silent duplicate-subscription bug for existing subscribers switching plans.
- Schedule downgrades at period end via Stripe Subscription Schedules.
- Show the user the effective date and a features-lost diff before confirming a downgrade.
- Allow cancellation of a pending scheduled downgrade.
- Surface the renewal date on the current plan card.
- Notify the user explicitly when a downgrade is scheduled, including the next renewal date and the ability to cancel before it takes effect.

**Non-Goals:**
- Changing plan pricing, tier names, or feature flags.
- Prorated refunds or credits for downgrades (period-end scheduling means none are needed).
- Mid-cycle downgrade (immediate effect). Always period-end.
- Free trial support.
- Multi-seat or team billing changes.

## Decisions

### D1: Stripe Subscription Schedules over `cancel_at_period_end` flag

**Decision:** Use `subscriptionSchedules.create()` + `subscriptionSchedules.update()` to schedule the price change at `current_period_end`.

**Rationale:** `cancel_at_period_end` cancels the subscription entirely — not a plan switch. There is no native Stripe API to schedule a price change without Subscription Schedules. The Schedules API is the only correct primitive.

**Alternative considered:** Updating the price immediately with `proration_behavior: 'none'`. Rejected — this changes the plan immediately, not at period end, which violates the intended behaviour.

### D2: Store `stripeSubscriptionId` in `UserProfile`

**Decision:** Persist `stripeSubscriptionId` from the webhook (`checkout.session.completed` and `customer.subscription.updated`) into `UserProfile`.

**Rationale:** Required to call `subscriptionSchedules.create({ from_subscription: subId })` and `subscriptions.update(subId, ...)`. Fetching it from Stripe at request time would add latency and a Stripe API call per page load. Persisting it in the webhook is the right pattern (same as `stripeCustomerId`).

**Security note:** The subscription ID is an internal Stripe reference. It is never exposed in client-side responses or URLs.

### D3: Store `pendingDowngradeTier` and `stripeScheduleId` in DB

**Decision:** After creating a schedule, persist `pendingDowngradeTier` and `stripeScheduleId` to `UserProfile`.

**Rationale:** The UI needs to show the pending state without a Stripe API call at render time. `stripeScheduleId` is required to release (cancel) the schedule. Both are set in the downgrade route and cleared in two places: the cancel route and the webhook (when the schedule executes).

**Alternative considered:** Fetch schedule state from Stripe at render time. Rejected — adds Stripe API latency on every settings page load, and the data is stable (doesn't change between page loads except on user action or period end).

### D4: Upgrades for existing subscribers use `subscriptions.update` (immediate + proration)

**Decision:** If `UserProfile.stripeSubscriptionId` is set, `POST /api/billing/checkout` calls `stripe.subscriptions.update()` with `proration_behavior: 'create_prorations'` instead of creating a Checkout session.

**Rationale:** Checkout for an existing subscriber creates a second subscription. `subscriptions.update` modifies the existing one. Proration is correct for upgrades (user pays the difference immediately).

**UX impact:** The user no longer leaves the page for upgrades on an existing subscription. A success redirect URL is returned instead of a Checkout URL, and the client follows it directly.

### D5: `customer.subscription_schedule.released` clears pending state

**Decision:** Handle the `customer.subscription_schedule.released` webhook event to clear `pendingDowngradeTier` and `stripeScheduleId` in DB when a schedule is released programmatically (cancel downgrade path).

**Rationale:** The release API call in `DELETE /api/billing/downgrade` also clears the DB directly, but the webhook provides a safety net for any out-of-band releases (e.g. from the Stripe dashboard). Belt-and-suspenders.

### D6: Detect upgrade vs downgrade from `PLAN_ORDER`

**Decision:** In both the API route and the UI, compare the index of the requested tier in `PLAN_ORDER` to the current tier's index. Lower index = downgrade; higher index = upgrade.

```
PLAN_ORDER = ["starter", "solo", "small_business"]
isDowngrade = PLAN_ORDER.indexOf(target) < PLAN_ORDER.indexOf(current)
```

**Rationale:** Single source of truth. If plan tiers are ever reordered or extended, `PLAN_ORDER` is the only place to update.

### D7: Lost features diff computed from `PLAN_CATALOG`

**Decision:** Compute the features-lost list client-side from `PLAN_CATALOG`:
- Boolean features: include if `current[feature] === true && target[feature] === false`
- Limit reductions (invoices, seats, accounts): include if target limit < current limit, formatted as "N → M"

**Rationale:** No hardcoding; automatically correct if plan features change. All data is already imported in `SubscriptionClient.tsx`.

### D8: Explicit notification required for scheduled downgrades

**Decision:** When a downgrade is scheduled, the system must emit a user-facing notice that makes the upcoming renewal change explicit and gives the user a clear path to cancel before the change takes effect.

**Rationale:** A pending state in the settings page is not enough on its own; the user should be told about the change outside the immediate UI flow so they are not surprised at renewal.

### D9: Upgrade preview should mirror downgrade preview

**Decision:** When the user selects a higher tier, the client should show the same comparison-style preflight used for downgrades, but inverted to emphasise the benefits they will gain before they continue to the new plan.

**Rationale:** The upgrade path currently feels abrupt because it jumps straight from selection to checkout or billing update. Reusing the same comparison panel keeps the mental model consistent: every plan change first answers "what changes for me?" and only then proceeds to the action CTA.

**Presentation rule:**
- Downgrade = "you will lose" + scheduled effective date + confirm/cancel controls
- Upgrade = "you will get" + immediate/prorated effect + continue-to-plan control

## Risks / Trade-offs

**[Risk] `stripeSubscriptionId` not yet stored for existing users** → Users who subscribed before this change have no `stripeSubscriptionId` in DB. Mitigation: in `POST /api/billing/checkout` and `POST /api/billing/downgrade`, fall back to fetching the subscription from Stripe via `stripe.customers.listSubscriptions(customerId)` when `stripeSubscriptionId` is null but `stripeCustomerId` exists. Backfill via webhook on next event.

**[Risk] Schedule creation fails mid-request** → The schedule is created in Stripe but DB write fails (or vice versa). Mitigation: the webhook's `customer.subscription_schedule.created` event can be used as a secondary trigger to persist schedule state. Route returns 500 on failure; no partial state is committed.

**[Trade-off] Two Stripe API calls for schedule creation** → `subscriptionSchedules.create` then `subscriptionSchedules.update`. Stripe does not support creating a schedule with phases in one call from an existing subscription. Acceptable latency (~300ms total).

**[Risk] User clicks downgrade, then immediately cancels before period end** → Handled by `DELETE /api/billing/downgrade` + `subscriptionSchedules.release()`. The release fires `customer.subscription.updated` with original price; DB is cleared.

**[Risk] Period end fires while user is mid-session** → The DB update happens via webhook. If the user's session is open during the rollover, their client-side `tier` reflects the old state until refresh. Mitigation: the success message on the settings page after downgrade confirmation tells them the effective date clearly.

## Migration Plan

1. Run `npx prisma migrate dev --name add-subscription-plan-switching-fields`
2. No RLS policy changes needed (fields added to existing `user_profiles` table, existing policies cover all columns)
3. Run `npm run verify-rls` to confirm
4. Register `customer.subscription_schedule.released` in the Stripe webhook dashboard (production endpoint)
5. Deploy; existing users without `stripeSubscriptionId` fall back to Stripe API lookup on first plan switch

## Open Questions

_(none — all decisions resolved in explore phase)_
