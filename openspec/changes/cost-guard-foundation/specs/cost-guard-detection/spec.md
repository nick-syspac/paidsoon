## ADDED Requirements

### Requirement: Cost Guard SHALL detect supplier and category drift
The system SHALL compare supplier and category spend against prior periods and create alerts when the variance exceeds both configured percentage and dollar thresholds.

#### Scenario: Supplier increase is detected
- **WHEN** current supplier spend exceeds the configured threshold for the selected lookback period
- **THEN** the system creates a supplier-increase alert with the baseline, actual amount, and variance

#### Scenario: Category increase is detected
- **WHEN** category spend has increased materially above the recent baseline
- **THEN** the system creates a category-increase alert on the relevant category

### Requirement: Cost Guard SHALL detect spend acceleration
The system SHALL identify when month-to-date spend is materially faster than the normal pattern for the same stage of the month.

#### Scenario: Spend velocity is ahead of normal pace
- **WHEN** month-to-date spend exceeds the expected velocity for the tenant
- **THEN** the system creates a spend-velocity alert and shows the projected monthly impact

### Requirement: Cost Guard SHALL detect unexpected and duplicate spend
The system SHALL alert on new suppliers, unusually large invoices, and duplicate or suspicious spending patterns by comparing records against prior supplier behaviour and transaction patterns.

#### Scenario: New supplier exceeds threshold
- **WHEN** a supplier has not previously appeared and the invoice amount exceeds the configured threshold
- **THEN** the system creates a new-supplier alert

#### Scenario: Duplicate charge is suspicious
- **WHEN** supplier, invoice number, amount, or reference data match the duplicate heuristics
- **THEN** the system creates a possible-duplicate alert with the matching transaction details

### Requirement: Cost Guard SHALL detect recurring-cost anomalies
The system SHALL compare actual recurring commitments to expected recurring spend and create a recurring-cost alert when the increase clears the configured thresholds.

#### Scenario: Recurring subscription cost increases
- **WHEN** the actual recurring payment exceeds the expected recurring cost by the configured threshold
- **THEN** the system creates a recurring-cost alert with support for expected vs actual values

### Requirement: Cost Guard SHALL make alerts idempotent
The system SHALL avoid duplicate alerts for the same underlying signal when the same sync runs again or the same supplier pattern remains unchanged.

#### Scenario: The same sync reruns
- **WHEN** the same spend data is processed a second time without change
- **THEN** the same alert is not duplicated
- **THEN** the existing alert is updated or kept stable rather than recreated
