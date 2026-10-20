# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL expose module settings for forecast and protection behavior
The system SHALL allow authorized users to configure module enablement, default horizon, fixed/percentage/weeks safety buffers, renewal warning windows, and detection thresholds. Persisted controls SHALL affect subsequent calculations; disabled modules SHALL retain records without publishing active protection or new alerts.

#### Scenario: User updates safety buffer policy
- **WHEN** a user saves a fixed amount or percentage-based safety buffer policy
- **THEN** future free-cash calculations use the new policy values

#### Scenario: User configures horizon default
- **WHEN** a user sets default commitment horizon to 60 days
- **THEN** CommitGuard summary views default to 60-day context until changed

#### Scenario: Weeks-based buffer
- **WHEN** an owner selects four weeks with a same-currency weekly operating-expense basis of 20000 cents
- **THEN** the editable values persist and the safety buffer is 80000 cents
- **AND** an absent expense basis is identified as missing, not zero

#### Scenario: Warning list is edited incrementally
- **WHEN** an owner types or clears a comma-separated warning list
- **THEN** intermediate text is preserved until validation on save and invalid or empty lists are rejected with an inline error

#### Scenario: Module is disabled
- **WHEN** the owner disables CommitGuard
- **THEN** commitments remain editable and historical data remains accessible, but automated detection, risk evaluation, CashPlan contribution, and active free-cash status are disabled

### Requirement: CommitGuard SHALL honor alert preference controls
The system SHALL allow users to toggle due-soon, renewal, notice-period, amount-change, buffer-low, and shortfall alerts. Current module/category preferences and advanced-alert entitlement SHALL be checked when events are evaluated and before they are included in a scheduled digest; historical audit entries SHALL remain available.

#### Scenario: Renewal alerts disabled
- **WHEN** a user disables renewal alerts
- **THEN** renewal notifications are not emitted for that user while other enabled alert categories remain active

#### Scenario: Preference changes after evaluation
- **WHEN** an owner disables an alert category after an event is stored but before digest generation
- **THEN** that event is excluded from the digest without deleting its audit history