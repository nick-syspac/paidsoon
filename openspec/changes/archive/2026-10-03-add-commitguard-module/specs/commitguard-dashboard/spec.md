## Purpose

Define the CommitGuard dashboard experience so owners can quickly understand committed cash, upcoming obligations, and free-cash risk from one module surface.

## ADDED Requirements

### Requirement: CommitGuard SHALL provide core cash-position hero metrics
The dashboard SHALL display Available Cash, Committed (Next 30 Days), Protected Cash, and Free Cash with status messaging tied to the shared free-cash service.

#### Scenario: User opens CommitGuard dashboard
- **WHEN** an authenticated user navigates to the CommitGuard dashboard
- **THEN** hero metrics render with values from tenant-scoped CommitGuard and related protection services

#### Scenario: Insufficient buffer detected
- **WHEN** free-cash status is AT_RISK or SHORTFALL
- **THEN** the dashboard displays explicit risk wording and does not rely on color alone to communicate severity

### Requirement: CommitGuard SHALL provide horizon and upcoming obligation views
The dashboard SHALL include horizon totals for 7/30/60/90 days and an upcoming commitments list supporting search, sorting, and filters for category, status, essentiality, recurrence type, source, and due period.

#### Scenario: User filters upcoming commitments
- **WHEN** a user applies category and due-period filters
- **THEN** the list updates to matching commitments while preserving tenant isolation and pagination behavior

#### Scenario: No commitments exist
- **WHEN** a tenant has no commitments
- **THEN** CommitGuard renders an empty state with actionable next steps that map to available product actions
