## ADDED Requirements

### Requirement: Cost Guard SHALL use the shared financial data layer
The system SHALL create Cost Guard on the same normalized transaction, supplier, and category data used across the financial-operations platform rather than creating a separate ledger or provider-specific cost dataset.

#### Scenario: Cost Guard reads normalized financial data
- **WHEN** the Cost Guard overview loads for a tenant
- **THEN** it reads transaction totals, supplier spend, and category aggregates from the shared financial layer
- **THEN** it preserves provenance metadata so the alert can be traced back to its source records

#### Scenario: Provider sync remains the system of record
- **WHEN** a cost spike is detected from Xero or MYOB data
- **THEN** the Cost Guard record retains the source provenance and does not mutate the provider ledger

### Requirement: Cost Guard SHALL calculate explainable baselines
The system SHALL persist historical baselines for supplier and category spend over recent periods and store both average and median values so abnormal changes are clearly grounded in prior behaviour.

#### Scenario: One large invoice distorts the average
- **WHEN** a supplier has a one-off large charge in the lookback window
- **THEN** the baseline stores the median as a stabilising reference alongside the average
- **THEN** the alert explains which baseline was used

### Requirement: Cost Guard SHALL detect materially unusual spend
The system SHALL flag supplier increases, category increases, spend velocity, recurring price increases, new suppliers, unusual invoices, and possible duplicates only after applying configured materiality thresholds.

#### Scenario: Material cost drift is detected
- **WHEN** a supplier or category exceeds both the configured percentage threshold and absolute dollar threshold
- **THEN** the system creates a Cost Guard alert with the baseline, actual, and variance values

#### Scenario: Invoice is unusually large
- **WHEN** a transaction materially exceeds the supplier's typical invoice range
- **THEN** the system creates an unusual-invoice alert and includes the matching evidence

### Requirement: Cost Guard SHALL support the alert lifecycle
The system SHALL support `new`, `acknowledged`, `expected`, `snoozed`, `investigating`, `resolved`, and `ignored` states, and it SHALL retain an audit trail for user actions.

#### Scenario: Owner marks a risk as expected
- **WHEN** the owner indicates the cost increase is intentional
- **THEN** the system sets the alert state to `expected`
- **THEN** the action is recorded in the Cost Guard audit log

#### Scenario: Owner resolves a risk
- **WHEN** the owner resolves an alert after investigation
- **THEN** the alert is marked resolved and removed from active risk consideration without deleting the historical evidence

### Requirement: Cost Guard SHALL produce a forecast and summary for the owner
The system SHALL calculate a lightweight month-end forecast based on actual spend-to-date, recurring commitments, and expected variable spend remaining, and it SHALL surface the result in the overview.

#### Scenario: Month-end spend is projected above normal
- **WHEN** the current spend path suggests the month will exceed the normal range
- **THEN** the overview displays the projected overspend with the assumptions used in the forecast

### Requirement: Cost Guard SHALL integrate with SpendLeak recurring commitments
The system SHALL treat SpendLeak recurring commitments as expected spend inputs when evaluating recurring-cost increases and forecast risk.

#### Scenario: Subscription cost increases unexpectedly
- **WHEN** an identified recurring commitment rises above its expected baseline
- **THEN** the system creates a recurring-cost increase alert and shows the expected versus actual values
