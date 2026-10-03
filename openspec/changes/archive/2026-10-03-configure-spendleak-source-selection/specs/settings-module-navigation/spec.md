## MODIFIED Requirements

### Requirement: Settings navigation respects entitlement and permission rules
The system SHALL only surface settings links that are valid for the user's current tier, plan entitlements, and module availability, using the existing feature-gating logic already implemented in the repo.

#### Scenario: User without the required entitlement opens a gated settings area
- **WHEN** a user lacks access to a module or feature gate already enforced elsewhere in the app
- **THEN** the corresponding settings entry either remains hidden or follows the existing upgrade or not-available pattern rather than exposing a misleading or duplicate control

#### Scenario: Eligible user accesses SpendLeak settings
- **WHEN** a user is eligible for SpendLeak under current subscription and feature rules
- **THEN** the settings navigation includes a SpendLeak settings destination
- **AND** the destination resolves to a real settings page rather than a placeholder-only state

#### Scenario: Ineligible user does not see SpendLeak settings destination
- **WHEN** a user is not eligible for SpendLeak under the current subscription rules
- **THEN** the SpendLeak settings destination remains unavailable and the module does not expose unauthorized controls
