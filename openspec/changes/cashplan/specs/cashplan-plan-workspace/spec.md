# cashplan-plan-workspace Specification

## Purpose
Define the CashPlan workspace experience so owners, bookkeepers, and approvers can review the forecast, drill into details, correct assumptions, and resolve issues without losing traceability.

## Requirements

### Requirement: Workspace navigation and status
The system SHALL provide a CashPlan workspace with Overview, Plan, Calendar, Scenarios, and Data quality views under the authenticated dashboard experience.

#### Scenario: User opens CashPlan workspace
- **WHEN** an authenticated user navigates to the CashPlan section
- **THEN** the system shows the current status, scenario selector, freshness metadata, and a primary action to add or adjust a planned item

### Requirement: Weekly plan detail and explanations
The system SHALL allow users to inspect weekly totals, grouped inflows and outflows, item-level details, and an explanation drawer showing assumptions, sources, and change history.

#### Scenario: User drills into a week or category
- **WHEN** a user selects a week or aggregate row
- **THEN** the system reveals the underlying items and the calculation used to derive the aggregate

### Requirement: Manual adjustments and data quality workflow
The system SHALL allow manual planned items or override edits to be created with reason, owner, expiry, and effective date while maintaining source immutability.

#### Scenario: Imported fact requires correction
- **WHEN** a user creates an override for a source-backed item
- **THEN** the system keeps the imported fact unchanged and records the override as an auditable change linked to the source record

#### Scenario: Data issue is detected
- **WHEN** a source is stale, a balance is missing, or a due date is unclear
- **THEN** the system surfaces a data-quality issue with severity and a clear remediation path in the Data quality tab
