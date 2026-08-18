## Purpose

Define how PaidSoon communicates integration availability in user-facing integration lists so readiness is clear, consistent, and actionable for customers evaluating accounting connectivity options.

## ADDED Requirements

### Requirement: Integration cards MUST show current availability state
The system SHALL display a normalized availability state for each supported integration card in user-facing integration directories, and the state SHALL reflect the product's current supported status.

#### Scenario: MYOB Business is available
- **WHEN** a user opens a surface that lists integration cards
- **THEN** the MYOB Business card shows an Available status state

#### Scenario: Xero is available
- **WHEN** a user opens a surface that lists integration cards
- **THEN** the Xero card shows an Available status state

### Requirement: Integration card copy MUST match availability state
The system SHALL present status badge labels and descriptive copy that are semantically consistent with each integration's availability state.

#### Scenario: Available integrations do not present pre-release messaging
- **WHEN** an integration has an Available status state
- **THEN** its badge and descriptive copy do not contain planned, early-access, or other pre-release language