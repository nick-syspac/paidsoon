## ADDED Requirements

### Requirement: SpendLeak SHALL export analysis findings as CSV and XLSX
The system SHALL allow an authenticated tenant user to export SpendLeak findings as CSV or XLSX report files.

#### Scenario: Export SpendLeak report as CSV
- **WHEN** an authenticated user requests a SpendLeak report export in CSV format
- **THEN** the system returns a valid UTF-8 CSV file
- **AND** the file contains one header row and one row per selected SpendLeak finding

#### Scenario: Export SpendLeak report as XLSX
- **WHEN** an authenticated user requests a SpendLeak report export in XLSX format
- **THEN** the system returns a valid XLSX workbook
- **AND** the workbook contains a worksheet with one header row and one row per selected SpendLeak finding

### Requirement: SpendLeak export SHALL respect the current filter scope
The system SHALL export only findings represented by the requesting user's active SpendLeak filter scope.

#### Scenario: Export from a filtered SpendLeak view
- **WHEN** a user exports after applying a SpendLeak filter
- **THEN** only findings matching that filter are exported
- **AND** findings outside that filter are excluded

#### Scenario: Export from an unfiltered SpendLeak view
- **WHEN** a user exports with no filter applied
- **THEN** all findings visible to that tenant in the SpendLeak view are exported

### Requirement: Export rows SHALL include analysis and decision context
The system SHALL include analysis fields needed for review workflows, including finding context, impact estimates, review outcomes, and source references where available.

#### Scenario: Export includes review action and notes
- **WHEN** a finding has a persisted review action and owner note
- **THEN** the export row includes that decision context
- **AND** the values match persisted SpendLeak data

#### Scenario: Optional evidence fields are missing
- **WHEN** a finding lacks optional evidence keys such as category or source reference
- **THEN** the export row remains valid
- **AND** missing optional values are emitted as empty fields

### Requirement: SpendLeak export SHALL remain analysis-only
The system SHALL position SpendLeak export as an analysis report and SHALL NOT provide accounting-system export formats in this capability.

#### Scenario: Request asks for accounting-format output
- **WHEN** a request attempts to use SpendLeak export as a ledger, journal, GST/BAS-ready, or provider-import format
- **THEN** the capability does not provide such output
- **AND** product copy/docs continue to describe SpendLeak export as analysis-only

### Requirement: SpendLeak export SHALL be tenant-safe and guarded
The system SHALL enforce authenticated tenant scoping and reject oversized or malformed export requests.

#### Scenario: Cross-tenant export attempt
- **WHEN** a user attempts to export findings outside their tenant scope
- **THEN** the system denies access
- **AND** no cross-tenant data is included in output

#### Scenario: Oversized export request
- **WHEN** an export request exceeds the configured row limit
- **THEN** the system rejects the request with an actionable error
- **AND** no partial export file is returned
