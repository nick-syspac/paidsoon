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

### Requirement: Subscription plan selector defaults to the current plan
The subscription settings plan selector SHALL highlight the user's current subscription tier when no valid public-plan selection intent is present.

An explicit `plan` query parameter SHALL override the initial highlight only when it identifies a public, customer-selectable tier. Missing, invalid, or contact-only values SHALL be treated as no selection intent and SHALL NOT fall back to Starter.

After the page loads, an explicit user selection SHALL take precedence over both query-based selection intent and the current tier.

#### Scenario: Normal settings navigation highlights current plan
- **WHEN** a Solo subscriber opens Settings → Subscription without a `plan` query parameter
- **THEN** Solo is highlighted in the plan selector
- **AND** Starter is not selected by default

#### Scenario: Valid public-plan deep link overrides initial highlight
- **WHEN** a Solo subscriber opens Settings → Subscription with `?plan=small_business`
- **THEN** Small Business is highlighted initially
- **AND** the user's current plan remains displayed as Solo

#### Scenario: Invalid plan intent falls back to current plan
- **WHEN** a Solo subscriber opens Settings → Subscription with an unknown `plan` value
- **THEN** Solo is highlighted
- **AND** the unknown value is not normalized to Starter

#### Scenario: Contact-only plan intent falls back to current plan
- **WHEN** a Solo subscriber opens Settings → Subscription with `?plan=accountant_partner`
- **THEN** Solo is highlighted
- **AND** the contact-only plan is not selected or exposed in the public plan selector

#### Scenario: User selection has highest precedence
- **WHEN** the selector initially highlights a plan from the current tier or a valid `plan` query parameter
- **AND** the user selects a different public plan
- **THEN** the newly selected plan is highlighted
