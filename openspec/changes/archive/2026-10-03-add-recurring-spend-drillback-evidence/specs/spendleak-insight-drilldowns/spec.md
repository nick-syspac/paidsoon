## MODIFIED Requirements

### Requirement: Evidence transparency
Each finding detail view SHALL display the supporting evidence payload required to explain the finding, including source references and timestamps when present.

#### Scenario: Evidence is available
- **WHEN** a finding includes source-linked evidence data
- **THEN** the detail view shows the evidence fields without exposing unrelated tenant records

#### Scenario: Limited evidence payload
- **WHEN** a finding has partial evidence data
- **THEN** the detail view renders the available evidence and indicates missing fields explicitly

#### Scenario: Recurring spend includes drill-back evidence
- **WHEN** a recurring-spend finding includes recent source-record evidence
- **THEN** the detail view shows recent recurring-charge rows with dates, amounts, and accounting references that help the user find the originating records in the source accounting package