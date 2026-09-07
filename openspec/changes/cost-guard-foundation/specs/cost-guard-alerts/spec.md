## ADDED Requirements

### Requirement: Cost Guard SHALL assign severity and confidence to each alert
The system SHALL calculate a severity score and confidence value for each alert based on impact, baseline deviation, recurrence likelihood, and evidence quality.

#### Scenario: High-risk supplier increase is detected
- **WHEN** a supplier is above baseline by a large amount and the change is recurring
- **THEN** the alert gets a severity score in the warning or critical range
- **THEN** the UI presents the severity label and the underlying confidence information

### Requirement: Cost Guard SHALL maintain alert lifecycle states
The system SHALL support lifecycle transitions for new, acknowledged, expected, snoozed, investigating, resolved, and ignored states with persisted audit history.

#### Scenario: Alert is acknowledged
- **WHEN** a user acknowledges an active alert
- **THEN** the lifecycle state changes to `acknowledged`
- **THEN** an audit event records the action, timestamp, and actor

#### Scenario: Alert is snoozed
- **WHEN** the owner chooses to snooze a warning temporarily
- **THEN** the alert remains visible as a historical item but is removed from active digest generation until the snooze period ends

### Requirement: Cost Guard SHALL render actions and evidence at the alert level
The system SHALL present the alert owner with the relevant evidence, baseline comparison, and recommended review action in the alert detail view.

#### Scenario: Owner reviews the issue
- **WHEN** the owner opens an alert detail page
- **THEN** they can see the supplier or category involved, the variance, and the supporting transactions
- **THEN** they can choose an action such as acknowledge, expected, snooze, resolve, or ignore

### Requirement: Cost Guard SHALL enable digest-based notification
The system SHALL send immediate critical notifications and aggregate lower-severity findings into daily or weekly digests without spamming the user for minor changes.

#### Scenario: Warning digest is assembled
- **WHEN** the system prepares the daily summary
- **THEN** it includes all warning-level alerts and suppresses already acknowledged or snoozed items
