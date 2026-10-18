# Spec Delta

## MODIFIED Requirements

### Requirement: Extend trial action
The tenant detail view SHALL provide owner-only trial management independent of the `trial-lapsed` diagnostic. The existing `extend-trial` endpoint SHALL delegate to safe Stripe extension, requiring elevation, owner role, reason, operation key and expected version. Presets SHALL be 7/14/30 days, with explicit future expiry supported. Non-trialing Stripe subscriptions SHALL be rejected by this compatibility endpoint; application-only grants SHALL use the explicit grant action.

#### Scenario: Admin extends a lapsed trial by 7 days
- **WHEN** an elevated platform owner selects seven days for a tenant with a `trial-lapsed` diagnostic
- **THEN** a fresh preview determines whether Stripe is still trialing
- **AND** if still suitable, its trial is extended from the later of now or effective trial expiry, synchronized and audited
- **AND** if Stripe is no longer trialing, the old endpoint rejects the request and directs the owner to explicit grant management

#### Scenario: Extension day count is validated
- **WHEN** the extend-trial endpoint receives a duration other than 7, 14 or 30 days, or an invalid explicit expiry
- **THEN** it returns 400 without a mutation

#### Scenario: Action is rejected for non-trialing tenants
- **WHEN** the compatibility extend-trial endpoint targets a tenant without a suitable trialing Stripe subscription
- **THEN** it returns 409 with an explanation
- **AND** no subscription is restarted or local trial expiry fabricated

#### Scenario: Active trial does not need a diagnostic
- **WHEN** an elevated owner opens management for a suitable still-active Stripe trial
- **THEN** extension is available without a `trial-lapsed` diagnostic

#### Scenario: Legacy endpoint cannot bypass new safeguards
- **WHEN** support/admin staff or an unsafe legacy payload calls the existing endpoint
- **THEN** it is rejected with 403 or validation failure respectively
- **AND** it cannot bypass owner authorization, audit, reason, idempotency or concurrency checks