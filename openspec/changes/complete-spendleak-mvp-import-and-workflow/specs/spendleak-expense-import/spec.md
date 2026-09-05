## Purpose

Allow SpendLeak to ingest owner-provided expense files when direct accounting sync is unavailable, incomplete, or delayed, while preserving tenant isolation and validation-first safety.

## ADDED Requirements

### Requirement: SpendLeak SHALL accept CSV and XLSX expense imports
The system SHALL allow authenticated users to upload expense data files in CSV or XLSX format for SpendLeak analysis.

#### Scenario: Upload supported expense file
- **WHEN** an authenticated user uploads a valid CSV or XLSX expense file within size and safety limits
- **THEN** the system creates a tenant-scoped SpendLeak expense import batch
- **AND** no SpendLeak findings are mutated until validation and commit are completed

#### Scenario: Reject unsupported or unsafe upload
- **WHEN** a user uploads an unsupported, malformed, encrypted, empty, or over-limit expense file
- **THEN** the system rejects the upload
- **AND** returns an actionable validation reason without exposing internal implementation details

### Requirement: Expense import SHALL include mapping and server-side validation before commit
The system SHALL require explicit column mapping and server-side validation of staged expense rows before imported data is committed to SpendLeak analysis records.

#### Scenario: Required expense fields are unmapped
- **WHEN** required expense columns are missing or unmapped
- **THEN** the system blocks validation and commit
- **AND** identifies each missing mapping requirement

#### Scenario: Validation returns warnings and errors
- **WHEN** validation finds row-level warnings or blocking errors
- **THEN** blocking errors prevent commit
- **AND** warnings are reviewable before the user confirms commit

### Requirement: Expense import commit SHALL be tenant-safe and idempotent
The system SHALL commit validated expense rows into SpendLeak spend records using stable deduplication keys so replayed imports do not create duplicate normalized records.

#### Scenario: Same expense file is committed again
- **WHEN** an already-committed expense dataset is re-uploaded and committed for the same tenant
- **THEN** matching records are updated or skipped according to duplicate policy
- **AND** duplicate normalized spend rows are not created

#### Scenario: Tenant isolation for import history
- **WHEN** a user requests import batch status, errors, or preview rows
- **THEN** only batches owned by that authenticated tenant are visible
- **AND** cross-tenant batch access returns not found or unauthorized