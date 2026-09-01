## MODIFIED Requirements

### Requirement: Downloadable import templates
The system SHALL provide version-compatible CSV invoice-import templates from the invoice-import screen.

#### Scenario: Download CSV template
- **WHEN** an authorised user selects Download CSV template
- **THEN** the system downloads a UTF-8 CSV file containing the supported canonical headings and fictional sample rows
- **AND** the sample email addresses use a non-deliverable domain
- **AND** the file can be uploaded and mapped by the current importer after the sample values are replaced

#### Scenario: No Excel template is offered
- **WHEN** an authorised user views the invoice-import screen
- **THEN** the system does not offer an Excel template download
- **AND** the available template guidance makes clear that CSV is the supported import format for now

### Requirement: CSV upload support
The system SHALL accept supported CSV files within configured safety and size limits.

#### Scenario: Upload supported file
- **WHEN** an authorised user uploads a valid CSV file within the configured limits
- **THEN** the system creates a tenant-scoped import batch
- **AND** inspects its headings and data without changing customers or invoices
- **AND** advances to sheet selection or column mapping

#### Scenario: Reject unsupported file
- **WHEN** a user uploads an unsupported, encrypted, macro-enabled, malformed, empty, over-limit, or XLSX file
- **THEN** the system rejects it without importing records
- **AND** displays an actionable reason without exposing internal implementation details
