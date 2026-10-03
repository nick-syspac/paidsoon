## ADDED Requirements

### Requirement: Spend-side financial foundation SHALL expose GST-credit-eligible signals to Tax Buffer
The system SHALL allow Tax Buffer to consume spend-side records and recurring commitments as potential GST-credit and deductible-expense inputs when classification confidence is sufficient.

#### Scenario: Eligible GST-inclusive spend detected
- **WHEN** spend ingestion identifies an expense with sufficient GST treatment evidence
- **THEN** the Tax Buffer calculation can include a corresponding GST credit estimate
- **THEN** the source record and confidence level are retained for explainability

### Requirement: Spend-side integration SHALL avoid overconfident tax assumptions
The system SHALL exclude or flag spend records with ambiguous tax treatment rather than forcing automatic GST-credit inclusion.

#### Scenario: Ambiguous tax treatment
- **WHEN** a spend record lacks enough information to classify GST treatment
- **THEN** Tax Buffer marks that portion as estimated or unknown
- **THEN** recommendations include a cautionary warning instead of implying exact credit certainty
