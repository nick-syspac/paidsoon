# Spec Delta

## MODIFIED Requirements

### Requirement: Settings import/export SHALL include CommitGuard module settings
The settings import/export system SHALL include CommitGuard policy configuration in module-scoped payloads with stable validation and partial-import compatibility. Fixed monetary buffer policies SHALL carry currency; owner cash balances, expense-basis amounts/dates, tax-currency attestations, conversion links, and job state SHALL NOT be transferred as settings.

#### Scenario: User exports module settings
- **WHEN** a user exports settings
- **THEN** CommitGuard settings fields are included with stable keys and schema-consistent value formats
- **AND** positive fixed-buffer amounts carry their currency without exporting owner cash or other financial-input attestations

#### Scenario: User imports settings missing CommitGuard keys
- **WHEN** an import payload omits CommitGuard fields
- **THEN** existing CommitGuard settings remain unchanged and import processing follows existing partial-import semantics

#### Scenario: Legacy fixed buffer has no currency
- **WHEN** an imported positive fixed-buffer policy has no currency
- **THEN** its amount is retained as requiring currency confirmation and it is not silently interpreted in the current cash currency