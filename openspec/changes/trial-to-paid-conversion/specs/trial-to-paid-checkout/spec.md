## ADDED Requirements

### Requirement: Trial users can initiate Stripe Checkout to subscribe
The system SHALL provide a `/billing/checkout` page that accepts a `plan` query parameter, retrieves the Stripe Checkout session URL for the specified tier, and immediately redirects the user to the Stripe-hosted payment form. No intermediate confirmation step is required.

#### Scenario: Trial user clicks "Add payment" and lands on checkout page
- **WHEN** a trial user navigates to `/billing/checkout?plan=solo`
- **THEN** the system creates a Stripe Checkout session for the solo tier and redirects the user to the Stripe-hosted checkout URL

#### Scenario: Plan param is absent — falls back to user's current tier
- **WHEN** a user navigates to `/billing/checkout` with no `plan` query parameter
- **THEN** the system uses the user's current `subscriptionTier` from their profile as the plan for the Checkout session

#### Scenario: Unauthenticated user reaches checkout page
- **WHEN** an unauthenticated user navigates to `/billing/checkout`
- **THEN** the system redirects them to `/sign-in`

#### Scenario: Checkout session creation fails (e.g. price ID not configured)
- **WHEN** the billing API returns an error while creating a Checkout session
- **THEN** the system renders a user-visible error message with a link back to the dashboard rather than displaying a blank error page or 404

### Requirement: Trial expired users are gated and redirected to checkout
The system SHALL redirect any authenticated user to `/billing/checkout?plan=<tier>&reason=trial_expired` when their `subscriptionStatus` is `"trialing"` and their `trialEndsAt` timestamp is in the past, preventing access to any dashboard page until payment is completed.

#### Scenario: Trial-expired user visits dashboard
- **WHEN** a user whose `trialEndsAt` is in the past and `subscriptionStatus` is `"trialing"` loads any dashboard page
- **THEN** the system redirects them to `/billing/checkout?plan=<their-tier>&reason=trial_expired` before rendering any dashboard content

#### Scenario: User completes Stripe Checkout after trial expiry
- **WHEN** a previously trial-expired user completes Stripe Checkout
- **THEN** the `checkout.session.completed` webhook sets `subscriptionStatus: "active"` and `trialEndsAt: null`, and the user can access the dashboard without being redirected

### Requirement: Active trial users see a persistent payment CTA
The system SHALL display a trial countdown banner in the dashboard for users whose `subscriptionStatus` is `"trialing"` and `trialEndsAt` is in the future. The banner SHALL include an "Add payment" link that navigates to `/billing/checkout?plan=<tier>`.

#### Scenario: Trial user visits dashboard with days remaining
- **WHEN** a user with an active trial loads any dashboard page
- **THEN** a banner is shown indicating the number of days remaining and providing an "Add payment" link pointing to `/billing/checkout?plan=<their-tier>`

#### Scenario: Banner link navigates correctly to checkout
- **WHEN** the trial user clicks the "Add payment" link in the banner
- **THEN** they are taken to `/billing/checkout?plan=<their-tier>` and immediately forwarded to Stripe Checkout
