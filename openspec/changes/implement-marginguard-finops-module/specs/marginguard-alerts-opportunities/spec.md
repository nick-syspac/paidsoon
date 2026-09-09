## Purpose

Define deterministic, threshold-driven alerts and opportunities that warn users about margin erosion and provide explainable, rule-based improvement actions.

## ADDED Requirements

### Requirement: MarginGuard SHALL evaluate threshold-driven margin alerts
The system SHALL create margin alerts for below-target and deterioration conditions using configured thresholds, with severity levels `info`, `warning`, or `critical` derived from rules.

#### Scenario: Critical margin threshold breached
- **WHEN** measured gross margin falls below configured critical threshold
- **THEN** MarginGuard creates or updates a critical alert with evidence and impacted scope

### Requirement: MarginGuard SHALL support alert lifecycle actions
The system SHALL allow authorized users to view, acknowledge, resolve, and dismiss alerts while preserving event history.

#### Scenario: Alert acknowledged
- **WHEN** a user acknowledges an active margin alert
- **THEN** alert state updates and an alert event record captures actor, timestamp, and prior state

### Requirement: MarginGuard SHALL emit explainable opportunities
The system SHALL generate rule-based opportunities with evidence, estimated impact, recommended action, and confidence state.

#### Scenario: Opportunity emitted for rising delivery costs
- **WHEN** delivery-cost trend materially reduces margin relative to baseline
- **THEN** MarginGuard creates an opportunity showing estimated margin impact and a cost-review recommendation
