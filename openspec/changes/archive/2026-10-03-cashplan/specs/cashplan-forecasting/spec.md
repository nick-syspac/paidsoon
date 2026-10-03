# cashplan-forecasting Specification

## Purpose
Define how the system builds and persists a deterministic 13-week cash forecast for a tenant using normalized cash facts, assumptions, and manual adjustments.

## Requirements

### Requirement: Base forecast generation
The system SHALL generate a tenant Base plan from opening cash, expected receipts, planned outflows, recurring obligations, and confirmed assumptions for a 13-week horizon.

#### Scenario: Tenant creates a preliminary plan
- **WHEN** a tenant has a valid base currency, cash sources, and sufficent cash facts or manual entries
- **THEN** the system creates a preliminary Base plan with a visible status and a deterministic weekly forecast

#### Scenario: Forecast inputs change
- **WHEN** a source fact, override, or assumption changes
- **THEN** the system recalculates the affected forecast and persists a new versioned snapshot without mutating the original source facts

### Requirement: Weekly calculation and confidence
The system SHALL calculate each week as opening cash plus included inflows minus included outflows and SHALL derive a transparent confidence score from source freshness, coverage, timing quality, and data issues.

#### Scenario: Weekly forecast is displayed
- **WHEN** the user opens the Plan view
- **THEN** the system shows opening cash, inflows, outflows, net movement, closing cash, lowest point, and buffer gap for the selected horizon

#### Scenario: Confidence falls below target
- **WHEN** stale sources, unconfirmed balances, or unresolved data-quality issues reduce confidence
- **THEN** the system marks the plan as preliminary or stale and exposes the specific factors affecting confidence

### Requirement: Scenario isolation
The system SHALL maintain scenario views as deltas from a versioned Base snapshot and SHALL prevent scenario edits from mutating imported facts or the Base plan without explicit promotion.

#### Scenario: User compares scenarios
- **WHEN** a user creates or edits a scenario
- **THEN** the system shows scenario deltas against Base and surfaces any rebase requirement when the Base snapshot changes

#### Scenario: Scenario promotion is confirmed
- **WHEN** a user selects and confirms promoted changes
- **THEN** the system applies only the selected changes to Base and records the action in the audit trail
