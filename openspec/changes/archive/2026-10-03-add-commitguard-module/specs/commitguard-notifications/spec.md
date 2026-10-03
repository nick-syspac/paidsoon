## Purpose

Define CommitGuard notification behavior using the shared product notification framework so commitment risk signals are timely and consistent with existing module alerts.

## ADDED Requirements

### Requirement: CommitGuard SHALL publish notification events through the shared framework
The system SHALL emit commitment events for due-soon, amount-changed, renewal-approaching, notice-period-approaching, detected-commitment, buffer-low, and shortfall states via existing notification channels.

#### Scenario: Commitment due soon
- **WHEN** an active commitment enters the configured due-soon window
- **THEN** a COMMITMENT_DUE_SOON event is created through the shared notification pipeline

#### Scenario: Projected shortfall detected
- **WHEN** free-cash calculation returns SHORTFALL for the configured horizon
- **THEN** a COMMITMENT_SHORTFALL event is emitted with projected deficit context

### Requirement: CommitGuard notifications SHALL be deduplicated per commitment event window
The system SHALL avoid duplicate notifications for the same commitment and event window unless underlying risk state materially changes.

#### Scenario: Repeated scheduler runs
- **WHEN** scheduled evaluation runs multiple times before the commitment due window changes
- **THEN** users do not receive duplicate due-soon notifications for the same commitment window
