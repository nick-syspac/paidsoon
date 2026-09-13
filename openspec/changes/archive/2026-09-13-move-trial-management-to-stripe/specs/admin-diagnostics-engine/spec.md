## MODIFIED Requirements

### Requirement: Expired trial with no active subscription is flagged as an error
The diagnostics engine SHALL flag a `trial-lapsed` error when `UserProfile.subscriptionStatus` is `trialing` and the persisted trial end timestamp (synchronized from Stripe) is in the past.

#### Scenario: Trial has lapsed
- **WHEN** a tenant has `subscriptionStatus = trialing` and Stripe-synchronized trial end is before the current time
- **THEN** a `trial-lapsed` error diagnostic is returned

#### Scenario: Trial still active
- **WHEN** a tenant has `subscriptionStatus = trialing` and Stripe-synchronized trial end is in the future
- **THEN** no `trial-lapsed` diagnostic is returned

#### Scenario: Paid subscription, no trial concern
- **WHEN** a tenant has `subscriptionStatus = active` (paid)
- **THEN** no `trial-lapsed` diagnostic is returned
