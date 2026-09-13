## Purpose

Define requirements for plan and module-availability messaging on public pricing surfaces so marketed tier behavior remains aligned with the canonical plan catalog and entitlement logic.
## Requirements
### Requirement: Public pricing surfaces SHALL describe module availability through the canonical plan catalog
The pricing page and any public plan-comparison surface SHALL describe module availability, plan fit, and upgrade positioning using the canonical subscription plan catalog and centralized entitlement logic rather than hard-coded page-local tier copy.

#### Scenario: Pricing matrix reflects current module availability
- **WHEN** a visitor compares plans on the pricing page
- **THEN** the module and feature inclusions shown for each plan match the current canonical plan catalog and entitlement behavior
- **AND** the comparison does not rely on retired tier names or stale module bundles

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

