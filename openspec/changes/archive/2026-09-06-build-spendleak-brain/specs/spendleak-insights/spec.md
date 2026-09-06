## Purpose

Define the deterministic insight engine that turns normalized spend data into explainable, persisted SpendLeak findings.

## ADDED Requirements

### Requirement: SpendLeak shall generate explainable spend findings
The system SHALL generate persisted findings for recurring spend, price increases, duplicate spend, renewal alerts, supplier concentration/trend, and near-term cash-pressure risk. Each finding SHALL include supporting evidence and an estimated impact when one can be derived.

#### Scenario: Recurring spend is detected
- **WHEN** the imported spend history shows repeated charges from the same supplier on a stable cadence
- **THEN** the system creates a recurring-spend finding with supplier, amount, cadence, and supporting evidence

#### Scenario: Duplicate spend is detected
- **WHEN** two bills or payments from the same supplier match the duplicate-detection heuristics
- **THEN** the system creates a duplicate-spend finding that shows both source records and the evidence used to classify them as suspicious

#### Scenario: Renewal is approaching
- **WHEN** historical spend indicates an annual or fixed-term renewal is due within the configured alert window
- **THEN** the system creates a renewal finding with the expected renewal date and supporting spend history

### Requirement: SpendLeak shall persist findings with stable identity
The system SHALL store findings using a stable tenant/type/subject identity so that re-analysis updates the current finding instead of creating duplicates.

#### Scenario: Finding is re-detected with new evidence
- **WHEN** a detector raises the same finding type and subject for the same tenant after new data arrives
- **THEN** the system updates the existing finding record with the new evidence and impact estimate

#### Scenario: Different suppliers produce similar findings
- **WHEN** two suppliers independently match the same detector category
- **THEN** the system stores separate findings because the subject identity differs

### Requirement: SpendLeak shall keep findings explainable and reviewable
The system SHALL retain the evidence needed to explain why a finding was raised, and it SHALL keep lifecycle state separate from the detector output so users can suppress noise without losing the underlying analysis.

#### Scenario: User reviews a finding later
- **WHEN** a user opens a finding after a later sync has occurred
- **THEN** the finding still shows the evidence and impact used to generate it, not just a label

#### Scenario: User dismisses a noisy finding
- **WHEN** a user dismisses a finding
- **THEN** the detector output remains auditable while the finding's lifecycle state changes