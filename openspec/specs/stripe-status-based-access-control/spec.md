# stripe-status-based-access-control Specification

## Purpose
Define access-control and user-facing billing behavior from Stripe-backed subscription status so entitlement decisions no longer depend on account-age heuristics or local trial expiry calculations.
## Requirements
### Requirement: Access decisions SHALL use Stripe-backed subscription status matrix
Authorization and gating decisions for subscription-controlled product access SHALL use synchronized Stripe status values as the primary source of truth.

#### Scenario: Trialing status grants trial access
- **WHEN** a user's synchronized subscription status is `trialing`
- **THEN** trial-level access is granted according to their plan tier

#### Scenario: Active status grants paid access
- **WHEN** a user's synchronized subscription status is `active`
- **THEN** paid access is granted according to their plan tier

#### Scenario: Past-due status retains access with warning
- **WHEN** a user's synchronized subscription status is `past_due`
- **THEN** access remains temporarily available
- **AND** billing-warning state is exposed to the UI

#### Scenario: Unpaid or canceled status revokes access
- **WHEN** a user's synchronized subscription status is `unpaid` or `canceled`
- **THEN** subscription-gated access is revoked

#### Scenario: Incomplete status does not grant full access
- **WHEN** a user's synchronized subscription status is `incomplete`
- **THEN** full subscription access is not granted

### Requirement: Subscription UI SHALL display Stripe-synchronized lifecycle dates and warnings
Billing and account views SHALL render current plan, subscription status, trial end date, first/next billing date, cancellation-at-period-end state, and status-specific billing warnings from synchronized Stripe values.

#### Scenario: Trial user sees Stripe-backed trial end and first payment messaging
- **WHEN** a trialing user opens billing settings
- **THEN** trial end and first payment timing are shown from synchronized Stripe dates

#### Scenario: Warning statuses show actionable billing notice
- **WHEN** a user is `past_due`, `incomplete`, or `unpaid`
- **THEN** billing UI shows a warning state appropriate to the status

### Requirement: Local trial date arithmetic SHALL NOT independently control access
The system SHALL NOT grant or revoke subscription access solely from account creation date or locally computed trial expiry values when Stripe-backed subscription status is available.

#### Scenario: Account-age-only check cannot grant trial access
- **WHEN** a user record is within a local date range but Stripe status is not `trialing` or `active`
- **THEN** access is not granted on account-age logic alone

#### Scenario: Stripe-backed status overrides stale local trial dates
- **WHEN** local trial date fields are stale or absent
- **THEN** access outcomes still follow synchronized Stripe subscription status

