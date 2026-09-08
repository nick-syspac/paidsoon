## ADDED Requirements

### Requirement: Plan features SHALL centrally gate MarginGuard access
The plan feature catalog SHALL define MarginGuard capability flags that are evaluated centrally for route access, navigation visibility, and advanced functionality gating.

#### Scenario: Central feature gate blocks API access
- **WHEN** a user without MarginGuard entitlement calls a MarginGuard API route
- **THEN** route returns a subscription/entitlement error using existing API error conventions

### Requirement: MarginGuard feature depth SHALL be plan-configurable
The system SHALL support plan-tier feature progression for MarginGuard capabilities (overview, advanced alerts, scenarios, historical analytics) without hard-coding plan checks in UI components.

#### Scenario: Higher-tier feature enabled
- **WHEN** a tenant upgrades to a plan with scenario modeling entitlement
- **THEN** MarginGuard scenario tools become available without code-path changes outside central entitlement logic
