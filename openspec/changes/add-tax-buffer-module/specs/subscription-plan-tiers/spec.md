## ADDED Requirements

### Requirement: Tax Buffer access SHALL be enforced through plan feature entitlements
The system SHALL gate Tax Buffer capabilities through the central plan feature model and entitlement checks, not hard-coded tier names in UI or routes.

#### Scenario: Non-entitled user requests Tax Buffer API
- **WHEN** a user without the required Tax Buffer feature calls a Tax Buffer endpoint
- **THEN** the endpoint denies access before returning tenant financial details
- **THEN** the response includes an upgrade-compatible denial path

### Requirement: Tax Buffer SHALL support progressive feature depth by plan
The system SHALL allow basic/manual Tax Buffer features at lower tiers and unlock deeper automation, integration, and history features on higher tiers through feature flags.

#### Scenario: User upgrades tier
- **WHEN** a user moves from a basic entitlement tier to an advanced tier
- **THEN** newly entitled Tax Buffer capabilities become available without data migration across separate module stores
- **THEN** unavailable capabilities remain clearly marked when not yet implemented
