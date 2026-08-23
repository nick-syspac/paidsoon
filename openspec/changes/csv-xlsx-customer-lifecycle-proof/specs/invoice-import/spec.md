## MODIFIED Requirements

### Requirement: Server-side validation and safe import
The system SHALL validate every mapped row server-side before any application records are changed and SHALL treat imported rows as tracked invoice records that are subject to the same invoice lifecycle rules as other sources.

#### Scenario: Blocking errors found
- **WHEN** validation finds one or more blocking errors
- **THEN** the system does not permit commit
- **AND** shows the affected row and field with remediation guidance
- **AND** allows the user to download a sanitised error report

#### Scenario: Valid import commit creates tracked invoice lifecycle
- **WHEN** a valid CSV/XLSX file is committed
- **THEN** the imported records are converted into tenant-scoped tracked invoices
- **AND** the system preserves payment metadata and enables reminder workflows for overdue entries
- **AND** paid imported invoices are excluded from reminder generation without requiring manual cleanup

### Requirement: Tenant-safe import lifecycle
The system SHALL keep imported spreadsheet data tenant-scoped and minimise retention of temporary uploads and staging content while preserving the operational audit trail needed to validate the imported invoice lifecycle.

#### Scenario: Temporary cleanup after import completion
- **WHEN** an import completes, fails, is cancelled, or is abandoned
- **THEN** the raw upload and staging rows are removed as soon as no longer needed and no later than the retention policy allows
- **AND** the import metadata remains available for audit and support review

#### Scenario: Payment state does not drift across import batches
- **WHEN** an imported invoice is later marked paid via the normal invoice ledger workflow
- **THEN** the source batch does not keep creating reminder work for that invoice
- **AND** the tenant sees the invoice as resolved according to the same status model as other invoice sources
