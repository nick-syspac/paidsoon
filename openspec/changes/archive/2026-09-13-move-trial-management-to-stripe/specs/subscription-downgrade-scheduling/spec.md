## MODIFIED Requirements

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
