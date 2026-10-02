## MODIFIED Requirements

### Requirement: SpendLeak shall generate explainable spend findings
The system SHALL generate persisted findings for recurring spend, price increases, duplicate spend, renewal alerts, supplier concentration/trend, and near-term cash-pressure risk. Each finding SHALL include supporting evidence and an estimated impact when one can be derived.

#### Scenario: Recurring spend is detected
- **WHEN** the imported spend history shows repeated charges from the same supplier on a stable cadence
- **THEN** the system creates a recurring-spend finding with supplier, amount, cadence, observed bill dates, and supporting source-record evidence

#### Scenario: Duplicate spend is detected
- **WHEN** two bills or payments from the same supplier match the duplicate-detection heuristics
- **THEN** the system creates a duplicate-spend finding that shows both source records and the evidence used to classify them as suspicious

#### Scenario: Renewal is approaching
- **WHEN** historical spend indicates an annual or fixed-term renewal is due within the configured alert window
- **THEN** the system creates a renewal finding with the expected renewal date and supporting spend history