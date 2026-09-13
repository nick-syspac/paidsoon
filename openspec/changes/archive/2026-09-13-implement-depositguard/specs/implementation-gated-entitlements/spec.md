## ADDED Requirements

### Requirement: DepositGuard preview mode SHALL be available to non-operational tiers
When tenants lack DepositGuard operational entitlements, the system SHALL still show DepositGuard navigation and overview context while keeping create/send/payment actions non-actionable.

#### Scenario: Essentials tenant opens DepositGuard
- **WHEN** a tenant without operational DepositGuard entitlement loads the DepositGuard dashboard route
- **THEN** the route returns a preview-safe experience with upgrade guidance
- **AND** operational APIs remain blocked server-side

#### Scenario: Non-entitled user calls operational API directly
- **WHEN** a non-entitled user sends a direct create/send/record-payment request
- **THEN** the API returns a deterministic upgrade-required response and does not create financial records
