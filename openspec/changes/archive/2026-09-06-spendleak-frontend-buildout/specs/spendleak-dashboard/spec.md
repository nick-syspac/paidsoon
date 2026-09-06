## Purpose

Define the user-facing SpendLeak dashboard experience so authenticated users can view spend-side findings, cash-out signals, and data freshness in a consistent, actionable surface.

## ADDED Requirements

### Requirement: SpendLeak dashboard route and access
The system SHALL provide a dedicated authenticated SpendLeak dashboard surface under the dashboard area and SHALL require the same authenticated access controls as other /dashboard routes.

#### Scenario: Authenticated user opens SpendLeak dashboard
- **WHEN** an authenticated user navigates to the SpendLeak dashboard route
- **THEN** the system renders the SpendLeak dashboard shell with navigation, page heading, and dashboard modules

#### Scenario: Unauthenticated request to SpendLeak dashboard
- **WHEN** a request is made to the SpendLeak dashboard route without a valid session
- **THEN** the system applies the existing dashboard auth behavior and does not reveal tenant spend data

### Requirement: SpendLeak dashboard modules
The SpendLeak dashboard SHALL render module-level summaries for recurring spend, duplicate spend, upcoming renewals, supplier concentration, and near-term cash pressure when corresponding findings are available.

#### Scenario: Findings are available
- **WHEN** a user has one or more findings in those categories
- **THEN** the dashboard shows each relevant module with count, severity, and estimated impact where present

#### Scenario: No findings in a category
- **WHEN** a user has no findings for a module category
- **THEN** that module renders a clear empty state rather than stale or placeholder values

### Requirement: Data freshness and sync state visibility
The SpendLeak dashboard SHALL show data freshness metadata and sync-state messaging so users can distinguish fresh data, stale data, and not-yet-synced states.

#### Scenario: Data is stale
- **WHEN** the latest spend-side sync is older than the freshness threshold defined by the backend contract
- **THEN** the dashboard displays a stale-data warning with the latest sync timestamp

#### Scenario: No spend-side sync has completed
- **WHEN** the user has connected accounting sources but no completed spend-side sync record
- **THEN** the dashboard displays a setup/initial-sync state with no fabricated findings
