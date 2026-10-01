## ADDED Requirements

### Requirement: Tenant can configure expected SpendLeak source families
The system SHALL allow an authenticated, eligible tenant user to configure which supported SpendLeak source families are expected for readiness evaluation.

#### Scenario: User opens SpendLeak settings
- **WHEN** an eligible authenticated user opens SpendLeak settings
- **THEN** the system shows the supported source families and the currently effective selection
- **AND** the selection defaults to all supported source families when no explicit tenant setting exists

#### Scenario: User updates expected source families
- **WHEN** the user saves a valid source selection
- **THEN** the system persists the selection tenant-scoped
- **AND** subsequent SpendLeak readiness evaluation uses that selection

### Requirement: Source-selection updates are validated and safe
The system SHALL validate source-selection updates against a bounded supported-source enum and SHALL reject empty selections.

#### Scenario: Empty selection submitted
- **WHEN** a request attempts to persist an empty source-selection array
- **THEN** the system rejects the request with a validation error
- **AND** existing saved settings remain unchanged

#### Scenario: Unsupported source key submitted
- **WHEN** a request includes one or more unsupported source keys
- **THEN** the system rejects the request with a validation error
- **AND** no partial update is applied

### Requirement: Source selection does not disable ingestion in this phase
The system SHALL treat source selection as readiness expectation configuration and SHALL NOT disable spend ingestion pipelines for unselected source families in this phase.

#### Scenario: Tenant unselects one source family
- **WHEN** the tenant saves a selection that excludes a supported source family
- **THEN** SpendLeak readiness semantics ignore that source family for completeness checks
- **AND** provider/import ingestion behavior remains unchanged unless changed by a separate capability
