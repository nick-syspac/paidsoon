# Subscription Plan Switching - Manual Smoke Checklist

Use this checklist to complete tasks 8.3, 8.4, 8.5, 8.6, 8.7, and 9.4.

## Preconditions

- App is running with Stripe test mode credentials.
- Billing webhook endpoint is reachable in the target environment.
- You have three test users with current tiers: starter, solo, and small_business.

## Task 8.3 - Stripe Webhook Event Registration

1. Open Stripe Dashboard.
2. Go to Developers -> Webhooks.
3. Open the billing webhook endpoint used by this app.
4. Add the event customer.subscription_schedule.released to listened events.
5. Save changes.

Pass criteria
- Event appears in listened events for the billing webhook endpoint.

Evidence to record
- Timestamp:
- Endpoint URL:
- Event list includes customer.subscription_schedule.released: yes/no

## Task 8.4 - New Checkout Subscription Writes Fields

1. Sign in as a fresh test user with no active subscription.
2. Go to Settings -> Subscription.
3. Start a subscription via Checkout.
4. Complete Checkout in Stripe test mode.
5. Return to app and confirm success state.
6. Verify in database that user_profiles has:
   - stripe_subscription_id set
   - subscription_current_period_end set

Pass criteria
- Both fields are non-null for the subscribed user.

Evidence to record
- User id:
- Stripe subscription id:
- subscription_current_period_end (UTC):

## Task 8.5 - Schedule Downgrade and Verify UI + Stripe

1. Sign in as a small_business test user.
2. Go to Settings -> Subscription.
3. Choose starter plan.
4. Confirm the downgrade in the inline confirmation panel.
5. Verify panel text shows:
   - effective date at next renewal
   - expected lost features and reduced limits
6. In Stripe Dashboard, confirm a Subscription Schedule was created for this subscription.

Pass criteria
- UI shows pending downgrade state with correct target plan and date.
- Stripe shows an attached schedule with future phase change to starter.

Evidence to record
- User id:
- Current plan before action:
- Target plan:
- Effective date shown in UI:
- Stripe schedule id:

## Task 8.6 - Cancel Pending Downgrade

1. Stay on or return to Settings -> Subscription for the same user.
2. Click Cancel scheduled downgrade.
3. Confirm success message/state in UI.
4. Verify Stripe schedule is released.
5. Verify database user_profiles fields are cleared:
   - pending_downgrade_tier is null
   - stripe_schedule_id is null

Pass criteria
- Pending downgrade state disappears in UI.
- Stripe schedule is released.
- Both DB fields are null.

Evidence to record
- User id:
- Released schedule id:
- pending_downgrade_tier null: yes/no
- stripe_schedule_id null: yes/no

## Task 8.7 - Existing Subscription Upgrade Uses subscriptions.update

1. Sign in as a starter user with an active existing subscription.
2. Go to Settings -> Subscription.
3. Select solo and confirm.
4. Verify flow does not create a second subscription.
5. In Stripe Dashboard, confirm:
   - same subscription id remains active
   - item price changed to solo
   - proration line item/charge is present

Pass criteria
- Exactly one active subscription for the customer.
- Plan updated on same subscription.
- Proration behavior is visible.

Evidence to record
- User id:
- Subscription id before:
- Subscription id after:
- Proration evidence (invoice/line item id):

## Task 9.4 - Current Plan Highlight on Direct Navigation

Run these direct URLs while signed in as each tier user:
- starter user: /dashboard/settings/subscription
- solo user: /dashboard/settings/subscription
- small_business user: /dashboard/settings/subscription

For each user:
1. Load page directly in browser.
2. Confirm the current plan card is highlighted.
3. Confirm no incorrect fallback selection appears.

Pass criteria
- Each user sees their own current plan highlighted.

Evidence to record
- starter highlighted correctly: yes/no
- solo highlighted correctly: yes/no
- small_business highlighted correctly: yes/no

## Optional DB Spot Check Query

Use your normal SQL tool against user_profiles for tested users:

SELECT id, subscription_tier, stripe_subscription_id, subscription_current_period_end, pending_downgrade_tier, stripe_schedule_id
FROM user_profiles
WHERE id IN ('<user-1>', '<user-2>', '<user-3>');

## Completion Report Template

- 8.3 done: yes/no
- 8.4 done: yes/no
- 8.5 done: yes/no
- 8.6 done: yes/no
- 8.7 done: yes/no
- 9.4 done: yes/no

Notes:
- 
