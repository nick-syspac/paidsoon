## Purpose

Define requirements for plan and module-availability messaging on public pricing surfaces so marketed tier behavior remains aligned with the canonical plan catalog and entitlement logic.

## Requirements

### Requirement: Public pricing surfaces SHALL describe module availability through the canonical plan catalog
The pricing page and any public plan-comparison surface SHALL describe module availability, plan fit, and upgrade positioning using the canonical subscription plan catalog and centralized entitlement logic. The pricing page SHALL include an intent selector asking which financial control problem the visitor wants to address first and SHALL map each intent to a recommended starting plan narrative.

#### Scenario: Pricing matrix reflects current module availability
- **WHEN** a visitor compares plans on the pricing page
- **THEN** the module and feature inclusions shown for each plan match the current canonical plan catalog and entitlement behavior
- **AND** the comparison does not rely on retired tier names or stale module bundles

#### Scenario: Visitor uses intent selector before plan comparison
- **WHEN** a visitor indicates they want to prioritize invoice collection, unnecessary spend reduction, cash visibility, or complete control
- **THEN** the pricing surface presents a recommended plan framing for that intent
- **AND** the recommendation preserves canonical entitlement truth instead of hard-coded divergent promises

#### Scenario: Contact-only plan remains excluded from self-serve selection
- **WHEN** a pricing or plan-comparison surface references Accountant Partner
- **THEN** it may describe the plan as contact-only context
- **AND** it does not present Accountant Partner as a self-serve selectable checkout option

### Requirement: Plan catalog SHALL include DepositGuard capability entitlements and limits
The canonical plan catalog SHALL define DepositGuard feature gates and usage limits through centralized entitlement fields rather than UI-local plan checks.

#### Scenario: Entitlements are evaluated for an operational DepositGuard action
- **WHEN** a server API evaluates whether a user can create or send a deposit request
- **THEN** access is determined from canonical plan entitlements for DepositGuard capabilities

#### Scenario: Active jobs limit applies by plan
- **WHEN** a tenant at its DepositGuard active-jobs limit attempts to create another active job
- **THEN** the system blocks the action with a deterministic limit-reached response

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

### Requirement: Plan catalog SHALL define CommitGuard capability matrix
The plan catalog SHALL map CommitGuard capabilities and limits per tier through the canonical subscription feature model used across modules.

#### Scenario: Starter tier user
- **WHEN** a starter-tier user accesses CommitGuard
- **THEN** the system exposes starter-allowed capabilities and enforces starter-specific limits through the centralized plan model

#### Scenario: Higher-tier user
- **WHEN** a higher-tier user accesses CommitGuard forecast and integration features
- **THEN** the system grants only the capabilities enabled by the canonical tier definition in the shared plan catalog
