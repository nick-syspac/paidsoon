## Purpose

Define deterministic commitment forecasting and free-cash calculations so CommitGuard can project near-term outflows and produce a reusable cash safety assessment.

## ADDED Requirements

### Requirement: CommitGuard SHALL project commitment totals by horizon
The system SHALL calculate commitment totals for at least 7, 30, 60, and 90 day horizons using recurrence rules and next due dates without pre-generating unnecessary persisted future rows.

#### Scenario: Recurring monthly commitment
- **WHEN** a monthly commitment has a next due date inside the next 90 days
- **THEN** horizon totals include each projected in-horizon occurrence derived from recurrence logic

#### Scenario: Paused or cancelled commitment
- **WHEN** a commitment status is PAUSED or CANCELLED
- **THEN** that commitment is excluded from active future obligation totals for horizons after the status takes effect

### Requirement: Free cash SHALL be computed by a canonical service
The system SHALL compute free cash through one shared calculation contract that returns cash available, protected components, free cash, and safety status.

#### Scenario: Protected cash components exist
- **WHEN** cash available, commitment protection, tax protection, and safety buffer are all present
- **THEN** the service returns a deterministic free-cash value and a status in SAFE, WATCH, AT_RISK, or SHORTFALL

#### Scenario: CommitGuard data is reused by other modules
- **WHEN** CashPlan or overview summaries request free-cash metrics
- **THEN** they receive values from the shared service output rather than duplicating formula logic in module-specific UI or route code
