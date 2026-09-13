## MODIFIED Requirements

### Requirement: Extend trial action
The system SHALL provide an `extend-trial` corrective action accessible from the tenant detail view. When triggered with a number of days (1–30), the action SHALL extend the trial through Stripe subscription management and then persist the synchronized resulting trial end in `UserProfile`. The action SHALL only be available when the `trial-lapsed` diagnostic is present and the tenant's `subscriptionStatus` is `trialing`. The action SHALL write an `AdminAuditEvent` with the previous and resulting trial end values in metadata.

#### Scenario: Admin extends a lapsed trial by 7 days
- **WHEN** an admin selects 7 days and confirms the extend-trial action for a tenant with `trial-lapsed` diagnostic
- **THEN** Stripe trial end is extended for the tenant subscription
- **AND** synchronized trial end in `UserProfile` reflects the new value
- **AND** an audit event is written
- **AND** the `trial-lapsed` diagnostic no longer appears on the tenant detail page

#### Scenario: Extension day count is validated
- **WHEN** the extend-trial endpoint receives a `days` value outside 1–30
- **THEN** the endpoint returns 400 with a validation error

#### Scenario: Action is rejected for non-trialing tenants
- **WHEN** the extend-trial endpoint is called for a tenant whose `subscriptionStatus` is not `trialing`
- **THEN** the endpoint returns 409 with an error message
