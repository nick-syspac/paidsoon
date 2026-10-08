# Spec Delta

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

#### Scenario: Duplicate payment shows the matched transactions
- **WHEN** a duplicate-payment finding includes evidence for the two transactions that triggered the finding
- **THEN** the detail view shows both transactions in a readable table with their dates, amounts, descriptions, counterparties, and source-record references
- **AND** the comparison summary identifies the counterparty when supplier evidence is absent

#### Scenario: Older duplicate payment has no transaction rows
- **WHEN** a duplicate-payment finding predates transaction-row evidence or has only partial evidence
- **THEN** the detail view shows the available aggregate evidence and explicitly marks unavailable values without inventing transaction details