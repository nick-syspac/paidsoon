## Purpose

Define the Tax Buffer user experience for summary metrics, reserve health, category composition, upcoming obligations, and actionable reserve recommendations.

## ADDED Requirements

### Requirement: Tax Buffer SHALL provide a dedicated dashboard module route
The system SHALL expose a dedicated Tax Buffer dashboard route with summary metrics and module navigation consistent with existing dashboard conventions.

#### Scenario: User navigates to Tax Buffer
- **WHEN** a user opens the Tax Buffer dashboard route
- **THEN** the page shows available cash, total tax reserved, safe-to-spend cash, and reserve gap
- **THEN** loading, empty, stale, and insufficient-data states are rendered with explicit guidance

### Requirement: Tax Buffer SHALL show reserve health status
The system SHALL classify reserve health into `healthy`, `watch`, `underfunded`, `critical`, or `unknown` states using configurable thresholds.

#### Scenario: Reserve below underfunded threshold
- **WHEN** current reserved amount is below configured underfunded ratio for required reserve
- **THEN** the dashboard status shows `underfunded` or `critical` according to threshold bands
- **THEN** the state includes a concise recommended action amount

### Requirement: Tax Buffer SHALL provide obligation and category breakdowns
The system SHALL display category-level reserve composition and upcoming obligations with due dates, estimated amounts, reserved amounts, and shortfall/covered status.

#### Scenario: Upcoming obligations list is filtered by horizon
- **WHEN** a user chooses an upcoming 30-day or 60-day horizon filter
- **THEN** the obligations list returns only obligations in that horizon
- **THEN** sort and drill-down actions preserve tenant-scoped visibility

### Requirement: Tax Buffer SHALL provide explainable recommendation outputs
The system SHALL provide a weekly reserve target and near-term transfer recommendation with category-level reason lines.

#### Scenario: Recommendation generated from multiple shortfalls
- **WHEN** GST and income-tax categories are both under-reserved
- **THEN** the recommendation includes total suggested transfer amount
- **THEN** the explanation lists category-level shortfall contributors
