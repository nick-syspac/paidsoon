# cost-guard-alerts Specification

## Purpose

Define the alert lifecycle, severity model, and user actions for Cost Guard so owners can acknowledge, classify, or resolve cost-risk findings without losing auditability.

## Requirements

### Requirement: Cost Guard SHALL create severity-based alerts
The system SHALL assign a severity and score to each alert based on the financial impact, variance, recurrence likelihood, and detection confidence.

#### Scenario: High-risk cost drift is identified
- **WHEN** a supplier increase exceeds the configured threshold and the absolute impact is large
- **THEN** the system creates a high-severity alert with a score in the Warning or Critical band

### Requirement: Cost Guard SHALL support alert lifecycle states
The system SHALL support alert states including `new`, `acknowledged`, `expected`, `snoozed`, `investigating`, `resolved`, and `ignored`.

#### Scenario: Owner marks the finding as expected
- **WHEN** the owner indicates that the cost increase is intentional
- **THEN** the alert changes to `expected` and an audit event is created

#### Scenario: Owner snoozes the alert temporarily
- **WHEN** the owner snoozes a warning
- **THEN** the alert remains visible in the dashboard but is suppressed from active digest output until the snooze window ends

### Requirement: Cost Guard SHALL preserve audit history
The system SHALL store every alert lifecycle action in an audit log with timestamp, actor, and reason when possible.

#### Scenario: An alert is resolved
- **WHEN** the owner resolves the alert
- **THEN** the system records the state change with a timestamp and context for future review

### Requirement: Cost Guard SHALL surface actionable summaries
The system SHALL present alerts in summary form that answer: what changed, why it matters, and what to look at.

#### Scenario: Owner sees an alert detail
- **WHEN** the owner opens an alert
- **THEN** the system shows the baseline, variance, supporting transactions, and a human-friendly explanation of the issue

## Acceptance Criteria

- Severity labels are persisted and surfaced in the dashboard
- Alert lifecycle state changes are tracked in an audit log
- Owners can acknowledge, snooze, resolve, or mark an alert as expected
- Alert detail displays baseline, variance, and supporting evidence
- Critical alerts can be surfaced immediately while warnings are included in daily digests
