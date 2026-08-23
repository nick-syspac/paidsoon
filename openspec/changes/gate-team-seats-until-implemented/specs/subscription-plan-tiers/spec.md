## MODIFIED Requirements

### Requirement: Tier user seat limits
The system SHALL define user-seat limits by tier: Starter allows 1 user, Solo allows 1 user, and Small Business allows up to 3 users. While Team seats are not implemented, these limits SHALL be presented as plan context only and Team invite workflows SHALL remain non-actionable.

#### Scenario: User invite exceeds plan seat cap
- **WHEN** Team seats are implemented and an account admin invites a user that would exceed the active tier seat limit
- **THEN** the system rejects the invite and provides a plan-limit upgrade message

#### Scenario: Team settings is opened while Team seats are unimplemented
- **WHEN** an authenticated user opens Team settings and the `team_seats` feature is marked unimplemented
- **THEN** Team settings shows coming-soon status and does not allow sending team invites

#### Scenario: Team invite API is called while Team seats are unimplemented
- **WHEN** a request is made to execute Team invite actions while `team_seats` is unimplemented
- **THEN** the system returns a feature-unavailable response rather than a success response

#### Scenario: Team seats are implemented in a future release
- **WHEN** `team_seats` is marked implemented and enabled for the active tier
- **THEN** Team invite workflows may become actionable and enforce the seat limit for that tier
