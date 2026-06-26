## MODIFIED Requirements

### Requirement: Trial-to-paid conversion path
The system SHALL provide a complete, working user journey from trialing status to active paid subscriber. The trial expiry gate SHALL redirect to a page that successfully initiates Stripe Checkout. The trial banner CTA SHALL link directly to `/billing/checkout?plan=<tier>`, not to the subscription settings page.

#### Scenario: Trial expiry gate reaches a working checkout page
- **WHEN** a trial-expired user is redirected by the dashboard layout gate
- **THEN** they land on `/billing/checkout?plan=<tier>&reason=trial_expired` which successfully initiates a Stripe Checkout session (not a 404)

#### Scenario: Trial banner "Add payment" link initiates checkout
- **WHEN** an active trial user clicks the "Add payment" link in the TrialBanner
- **THEN** they are taken to `/billing/checkout?plan=<tier>` and forwarded to Stripe Checkout (not to the subscription settings page)
