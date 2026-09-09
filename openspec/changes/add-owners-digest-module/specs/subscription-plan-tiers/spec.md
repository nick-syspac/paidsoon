# subscription-plan-tiers delta for add-owners-digest-module

## ADDED Requirements

### Requirement: Owner's Digest access SHALL be enforced through centralized plan entitlements

The system SHALL gate Owner's Digest access and delivery behavior through the canonical plan feature model and shared entitlement checks rather than hard-coded tier names in UI or routes.

#### Scenario: Non-entitled user requests Owner's Digest

- **WHEN** a user without the Owner's Digest feature entitlement requests the dashboard, settings, API, or email behavior for the module
- **THEN** the system denies access through the existing entitlement path before returning tenant digest details

#### Scenario: Entitlement check runs in shared plan logic

- **WHEN** the application checks whether Owner's Digest is available for a tenant
- **THEN** it resolves the result from the centralized plan catalog and feature-checking utilities

### Requirement: Owner's Digest SHALL support progressive module coverage by plan

The system SHALL allow broader Owner's Digest signal coverage and automation depth to expand by plan without creating separate digest products or duplicate tenant data stores.

#### Scenario: Lower tier has limited digest coverage

- **WHEN** a tenant's current plan includes Owner's Digest but only a subset of contributing modules
- **THEN** the digest uses only the entitled module providers and still produces a coherent summary

#### Scenario: Tenant upgrades to a broader plan

- **WHEN** the tenant moves to a plan with additional FinOps module entitlements
- **THEN** future digests incorporate signals from those newly entitled modules without requiring the tenant to recreate Owner's Digest settings or history
