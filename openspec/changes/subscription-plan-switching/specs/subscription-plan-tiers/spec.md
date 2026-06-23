## MODIFIED Requirements

### Requirement: Plan switching for existing subscribers uses subscription update
The system SHALL use `stripe.subscriptions.update()` for plan switches when the user already has an active subscription, rather than creating a new Stripe Checkout session.

Upgrades (moving to a higher-index tier in `PLAN_ORDER`) SHALL apply immediately with `proration_behavior: 'create_prorations'`.

Downgrades (moving to a lower-index tier in `PLAN_ORDER`) SHALL be routed to `POST /api/billing/downgrade`, which schedules the change at period end via Stripe Subscription Schedules.

#### Scenario: Existing subscriber upgrades immediately
- **WHEN** an authenticated subscriber posts a higher tier to `POST /api/billing/checkout` and `stripeSubscriptionId` is set
- **THEN** `stripe.subscriptions.update()` is called with the new price and `proration_behavior: 'create_prorations'`
- **AND** no new Stripe Checkout session is created

#### Scenario: New subscriber uses Checkout
- **WHEN** an authenticated user without an active subscription posts a tier to `POST /api/billing/checkout`
- **THEN** a Stripe Checkout session is created (behaviour unchanged)

#### Scenario: Downgrade routed to schedule endpoint
- **WHEN** an authenticated subscriber selects a lower tier
- **THEN** the request is handled by `POST /api/billing/downgrade` (not the checkout route)
- **AND** the change is scheduled for period end, not applied immediately
