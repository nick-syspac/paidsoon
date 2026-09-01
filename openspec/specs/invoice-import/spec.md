# invoice-import Specification

## Purpose
The invoice-import capability gives a tenant user a safe, reviewable spreadsheet workflow for bringing in customer and invoice records without requiring a live accounting sync. It provides versioned templates, explicit column mapping, server-side validation, and a paused-import safety model so reminder workflows remain intentionally controlled.
## Requirements
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

### Requirement: Column mapping and preview
The system SHALL allow source columns to be mapped to the canonical PaidSoon invoice-import fields and preview the interpreted data before commit.

#### Scenario: Suggested mapping
- **WHEN** recognised source headings are detected
- **THEN** the system suggests matching PaidSoon fields
- **AND** displays sample values and the proposed mappings for review
- **AND** allows the user to correct or ignore each mapping before validation

#### Scenario: Missing required mapping
- **WHEN** one or more required PaidSoon fields have not been mapped
- **THEN** the system prevents validation or commit
- **AND** identifies each missing field

### Requirement: Server-side validation and safe import
The system SHALL validate every mapped row server-side before any application records are changed.

#### Scenario: Blocking errors found
- **WHEN** validation finds one or more blocking errors
- **THEN** the system does not permit commit
- **AND** shows the affected row and field with remediation guidance
- **AND** allows the user to download a sanitised error report

#### Scenario: Warnings only
- **WHEN** validation finds warnings but no blocking errors
- **THEN** the system shows the warnings and proposed import counts
- **AND** allows the user to confirm the import explicitly

### Requirement: Tenant-safe import lifecycle
The system SHALL keep imported spreadsheet data tenant-scoped and minimise retention of temporary uploads and staging content.

#### Scenario: Temporary cleanup
- **WHEN** an import completes, fails, is cancelled, or is abandoned
- **THEN** the raw upload and staging rows are deleted immediately when no longer needed and no later than 24 hours after the batch ends
- **AND** import metadata remains available according to the PaidSoon audit policy

