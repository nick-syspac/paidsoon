## MODIFIED Requirements

### Requirement: Financial operations dashboard SHALL combine PaidSoon and SpendLeak signals
The system SHALL present SpendLeak findings alongside PaidSoon receivables signals so users can see cash coming in, cash going out, recommended next actions, and current review outcomes in one place.

#### Scenario: User exports filtered SpendLeak findings from dashboard
- **WHEN** a signed-in user views SpendLeak findings with an active filter scope and chooses export
- **THEN** the dashboard can request a SpendLeak report export for that current scope
- **AND** the exported report remains analysis-oriented and traceable to persisted findings
