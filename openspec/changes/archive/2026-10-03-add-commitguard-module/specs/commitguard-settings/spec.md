## Purpose

Define configurable CommitGuard settings for horizon defaults, safety buffer policy, detection thresholds, and alert preferences within the existing modular settings architecture.

## ADDED Requirements

### Requirement: CommitGuard SHALL expose module settings for forecast and protection behavior
The system SHALL allow authorized users to configure default horizon, safety buffer strategy, renewal warning windows, and detection thresholds through existing settings patterns.

#### Scenario: User updates safety buffer policy
- **WHEN** a user saves a fixed amount or percentage-based safety buffer policy
- **THEN** future free-cash calculations use the new policy values

#### Scenario: User configures horizon default
- **WHEN** a user sets default commitment horizon to 60 days
- **THEN** CommitGuard summary views default to 60-day context until changed

### Requirement: CommitGuard SHALL honor alert preference controls
The system SHALL allow users to toggle CommitGuard alert categories including due soon, renewal, notice-period, amount change, buffer-low, and shortfall alerts.

#### Scenario: Renewal alerts disabled
- **WHEN** a user disables renewal alerts
- **THEN** renewal notifications are not emitted for that user while other enabled alert categories remain active
