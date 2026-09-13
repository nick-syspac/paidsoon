# subscription-downgrade-scheduling Specification

## Purpose
TBD - created by archiving change subscription-plan-switching. Update Purpose after archive.
## Requirements
### Requirement: Show renewal date on current plan card
The subscription settings page SHALL display the current billing period end date ("Renews [date]") on the active plan card when `subscriptionCurrentPeriodEnd` is available.

#### Scenario: Renewal date shown for active subscriber
- **WHEN** the user views Settings → Subscription and has an active subscription with a known period end date
- **THEN** the current plan card shows "Renews [formatted date]" beneath the plan name

#### Scenario: Renewal date omitted when not available
- **WHEN** `subscriptionCurrentPeriodEnd` is null (e.g. no subscription yet)
- **THEN** no renewal date is shown and no error is thrown

### Requirement: Detect downgrade intent before executing
The UI SHALL detect when a user selects a plan with a lower index in `PLAN_ORDER` than their current plan (a downgrade) and show an inline confirmation panel instead of immediately proceeding.

#### Scenario: Lower-tier selection shows confirmation panel
- **WHEN** an existing subscriber on Small Business clicks "Switch to Starter" or "Switch to Solo"
- **THEN** an inline confirmation panel replaces the plan list, showing the effective date and features that will be lost

#### Scenario: Same or higher tier proceeds without confirmation
- **WHEN** a user on Starter clicks "Switch to Solo" or "Switch to Small Business"
- **THEN** no confirmation panel is shown; the upgrade proceeds immediately

### Requirement: Downgrade confirmation panel shows effective date and lost features
The confirmation panel SHALL display:
- The name of the target (lower) plan
- The date the downgrade takes effect (formatted from `subscriptionCurrentPeriodEnd`)
- A list of features and limits the user will lose, computed from `PLAN_CATALOG`
- A "Confirm downgrade" button and a "Keep current plan" button

#### Scenario: Lost boolean features listed
- **WHEN** the target plan has `feature: false` and the current plan has `feature: true`
- **THEN** the feature name is shown in the lost-features list

#### Scenario: Lost limit capacity listed
- **WHEN** the target plan has a lower `chasedInvoicesPerMonth`, `userSeats`, or `connectedStripeAccounts` than the current plan
- **THEN** the reduction is shown as "N → M" in the lost-features list

#### Scenario: Cancel returns to plan list
- **WHEN** the user clicks "Keep current plan" in the confirmation panel
- **THEN** the confirmation panel is dismissed and the plan list is shown again

### Requirement: Confirmed downgrade schedules via API and shows pending state
Upon confirmation, the UI SHALL call `POST /api/billing/downgrade`, and on success, update the display to show a "Scheduled downgrade" state on the current plan card.

#### Scenario: Downgrade confirmed — success state shown
- **WHEN** the user clicks "Confirm downgrade" and the API returns HTTP 200
- **THEN** the current plan card shows "Downgrading to [plan] on [date]" and a "Cancel scheduled downgrade" button
- **AND** the confirmation panel is dismissed

#### Scenario: Downgrade API failure shown as error
- **WHEN** `POST /api/billing/downgrade` returns a non-200 response
- **THEN** an error message is shown in the confirmation panel and the user remains on the confirmation step

### Requirement: Explicitly notify users when a downgrade is scheduled
The system SHALL provide an explicit user-facing notice when a downgrade is scheduled, so the user is told that their plan will change at the next renewal and that the change can still be cancelled before then.

#### Scenario: Scheduled downgrade triggers explicit notice
- **WHEN** a downgrade is successfully scheduled through `POST /api/billing/downgrade`
- **THEN** the user receives an explicit notice that states the plan change will take effect at the next renewal and includes a clear path to cancel before that date

#### Scenario: Notification content includes renewal timing
- **WHEN** the user sees the notice for a scheduled downgrade
- **THEN** it clearly references the upcoming renewal date and the fact that the downgrade is pending rather than already applied

### Requirement: Schedule downgrade at period end via Stripe Subscription Schedules
`POST /api/billing/downgrade` SHALL schedule the plan change using Stripe Subscription Schedules so the new price takes effect at `current_period_end`, not immediately.

#### Scenario: Authenticated eligible user schedules downgrade
- **WHEN** an authenticated user with an active subscription posts `{ tier: "starter" }` to `POST /api/billing/downgrade` and their current tier is higher
- **THEN** a Subscription Schedule is created in Stripe with two phases: current price until `current_period_end`, then the new price
- **AND** `pendingDowngradeTier` and `stripeScheduleId` are written to `UserProfile`
- **AND** the response is HTTP 200 with `{ scheduledAt: <ISO date> }`

#### Scenario: Unauthenticated request rejected
- **WHEN** `POST /api/billing/downgrade` is called without a valid session
- **THEN** HTTP 401 is returned

#### Scenario: Upgrade attempt via downgrade route rejected
- **WHEN** `POST /api/billing/downgrade` is called with a tier higher than the user's current tier
- **THEN** HTTP 400 is returned

#### Scenario: No existing subscription — downgrade route rejected
- **WHEN** the user has no `stripeCustomerId` or no active subscription
- **THEN** HTTP 400 is returned

### Requirement: Upgrade for existing subscribers uses subscriptions.update
`POST /api/billing/checkout` SHALL detect when `UserProfile.stripeSubscriptionId` is set and call `stripe.subscriptions.update()` with the selected plan price and `proration_behavior: 'create_prorations'` instead of creating a second Checkout subscription.

#### Scenario: Existing subscriber upgrade applies immediately
- **WHEN** an authenticated user with an active or trialing existing subscription posts a higher tier to `POST /api/billing/checkout`
- **THEN** the existing subscription is updated immediately (no new subscription created)
- **AND** proration is applied for the remaining billing period
- **AND** the response contains a success redirect URL

#### Scenario: New subscriber upgrade uses Checkout
- **WHEN** an authenticated user without a Stripe subscription requests checkout for a trial-eligible plan
- **THEN** a Stripe Checkout session is created
- **AND** trial configuration is set through Stripe subscription data (not a local trial calculator)

#### Scenario: Duplicate active or trialing subscription request is rejected
- **WHEN** checkout is requested while the user already has an active or trialing subscription that should not create a second subscription
- **THEN** the API returns a conflict-style error
- **AND** no additional Stripe subscription is created

### Requirement: Persist subscription fields from Stripe webhook
The billing webhook SHALL persist Stripe lifecycle fields including `stripeSubscriptionId`, subscription status, tier mapping, trial end, and current period boundaries from relevant subscription lifecycle events.

#### Scenario: Fields persisted on checkout completion
- **WHEN** `checkout.session.completed` fires with a subscription ID
- **THEN** `stripeSubscriptionId` and the synchronized lifecycle fields are written to the matching `UserProfile`

#### Scenario: Period end updated on subscription renewal
- **WHEN** `customer.subscription.updated` fires (e.g. renewal, trial update, cancellation scheduling, or plan change)
- **THEN** persisted lifecycle fields are updated to reflect the newest Stripe state

