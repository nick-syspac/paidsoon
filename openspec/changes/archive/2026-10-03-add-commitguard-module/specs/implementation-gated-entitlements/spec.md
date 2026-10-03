## ADDED Requirements

### Requirement: CommitGuard features SHALL be gated by centralized entitlement checks
The system SHALL enforce CommitGuard access and feature limits through shared entitlement services and SHALL not rely on hard-coded UI-only checks.

#### Scenario: User lacks detection entitlement
- **WHEN** a user without automatic detection entitlement requests detected commitments data
- **THEN** the API denies access according to centralized entitlement policy and returns the existing upgrade-safe response pattern

#### Scenario: User exceeds plan commitment limit
- **WHEN** a plan-scoped commitment cap is reached
- **THEN** create operations are blocked with a plan-aware limit response and existing commitments remain readable
