## Purpose

Define owner-facing dashboard and module-page behavior for RunwayGuard so cash survival status is understandable within seconds and actionable.

## ADDED Requirements

### Requirement: FinOps dashboard shows a RunwayGuard summary card
The system SHALL show a RunwayGuard summary card on the main FinOps dashboard with runway months or days, status, confidence, usable cash, and trend direction.

#### Scenario: Dashboard summary for deteriorating runway
- **WHEN** runway has declined materially over the configured lookback window
- **THEN** the summary card highlights a negative runway trend and warning status

### Requirement: RunwayGuard module page provides core runway headline
The system SHALL provide a dedicated RunwayGuard page showing runway days, runway months, expected cash-out date, status, confidence, usable cash, protected cash, and minimum projected cash.

#### Scenario: User opens RunwayGuard page
- **WHEN** an entitled tenant navigates to RunwayGuard
- **THEN** the page renders the runway headline with all core metrics

### Requirement: Runway timeline supports plan-appropriate horizons
The system SHALL provide a runway timeline view with supported horizons that include 30 days, 90 days, 6 months, and 12 months subject to plan entitlement and data availability.

#### Scenario: User changes timeline horizon
- **WHEN** a user selects a different supported horizon
- **THEN** the timeline updates projected usable cash, warning markers, and key events for that horizon

### Requirement: Runway drivers explain change
The system SHALL display positive and negative runway drivers for the selected comparison window and distinguish deterioration drivers from offsetting improvements.

#### Scenario: Runway change explanation
- **WHEN** runway decreases during the last 30 days
- **THEN** the page shows the largest negative contributors and any offsetting positive contributors
