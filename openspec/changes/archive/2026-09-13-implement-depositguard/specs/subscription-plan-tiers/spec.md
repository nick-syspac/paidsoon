## ADDED Requirements

### Requirement: Plan catalog SHALL include DepositGuard capability entitlements and limits
The canonical plan catalog SHALL define DepositGuard feature gates and usage limits through centralized entitlement fields rather than UI-local plan checks.

#### Scenario: Entitlements are evaluated for an operational DepositGuard action
- **WHEN** a server API evaluates whether a user can create or send a deposit request
- **THEN** access is determined from canonical plan entitlements for DepositGuard capabilities

#### Scenario: Active jobs limit applies by plan
- **WHEN** a tenant at its DepositGuard active-jobs limit attempts to create another active job
- **THEN** the system blocks the action with a deterministic limit-reached response
