## 1. Database Schema and Migrations

- [x] 1.1 Create migration for `ImportBatch` table with lifecycle states (pending, mapping, validated, committed, failed)
- [x] 1.2 Create migration for `ImportStagingRow` table to hold pre-validated rows during import workflow
- [x] 1.3 Add nullable `paymentUrl` column to `TrackedInvoice` table (if not already present)
- [x] 1.4 Add RLS policies for `ImportBatch` and `ImportStagingRow` to enforce tenant isolation via `auth.uid()`

## 2. Backend API - File Upload and Mapping

- [x] 2.1 Implement POST `/api/invoices/import/upload` endpoint to accept CSV/XLSX files with size and format validation
- [x] 2.2 Parse uploaded file and detect column headings
- [x] 2.3 Persist upload as `ImportBatch` with initial `pending` state
- [x] 2.4 Implement POST `/api/invoices/import/<batchId>/mapping` endpoint to accept column mappings
- [x] 2.5 Store proposed mappings and return preview of first N rows with mapped values
- [x] 2.6 Validate that all required fields are mapped before advancing to validation

## 3. Backend API - Validation and Commit

- [x] 3.1 Implement POST `/api/invoices/import/<batchId>/validate` endpoint to run server-side validation
- [x] 3.2 Validate all mapped rows: required fields present, types correct, duplicate detection
- [x] 3.3 Return blocking errors (prevents commit) and warnings (non-blocking) with row-level details
- [x] 3.4 Allow user to download sanitized error report without exposing sensitive row data
- [x] 3.5 Implement POST `/api/invoices/import/<batchId>/commit` endpoint to create `TrackedInvoice` records
- [x] 3.6 Use idempotent logic (file hash-based deduplication) to prevent double imports
- [x] 3.7 Update `ImportBatch` state to `committed` and schedule cleanup of staging rows

## 4. Backend Business Logic - Import Lifecycle

- [x] 4.1 Implement batch state machine transitions (pending → mapping → validated → committed) with validation
- [x] 4.2 Ensure all import operations use `withUserContext(userId, async (tx) => { ... })` for RLS enforcement
- [x] 4.3 Create parsed import rows as `TrackedInvoice` records with all source metadata preserved
- [x] 4.4 Populate `paymentUrl` field from import CSV if `payment_url` column is provided and mapped
- [x] 4.5 Implement cleanup job to delete staging rows and upload files after retention period (configurable)
- [x] 4.6 Log import audit trail (batch created, rows validated, commit successful) for compliance

## 5. Frontend - Import UI Components

- [x] 5.1 Create file upload component with drag-and-drop, size/format validation, and error messaging
- [x] 5.2 Build column mapping UI allowing users to map CSV columns to PaidSoon fields
- [x] 5.3 Show preview of mapped data with sample rows before validation
- [x] 5.4 Implement validation feedback UI displaying blocking errors and warnings with remediation hints
- [x] 5.5 Add confirmation and commit workflow with success/failure states
- [x] 5.6 Implement import history view showing past batches, their state, and imported invoice counts

## 6. Frontend - Integration with Invoices Tab

- [x] 6.1 Add "Import invoices" button to Invoices tab
- [x] 6.2 Navigate from button to import workflow (upload → mapping → validation → commit)
- [x] 6.3 After successful commit, redirect to Invoices list showing newly imported invoices
- [x] 6.4 Ensure imported invoices are indistinguishable from other sources in invoice list views

## 7. Email and Reminder Integration

- [x] 7.1 Verify reminder email template includes `{{ invoice.paymentUrl }}` token
- [x] 7.2 Update reminder sender to preserve `paymentUrl` for all invoice sources (not just Stripe)
- [x] 7.3 Ensure payment link rendering is conditional (only render if `paymentUrl` is non-null)
- [x] 7.4 Test end-to-end: import invoice with payment URL → trigger reminder → verify link in email

## 8. Testing and Validation

- [x] 8.1 Add unit tests for CSV/XLSX parsing, column mapping, and field validation
- [x] 8.2 Add tests for import batch state transitions and idempotency
- [x] 8.3 Add integration tests for full import-to-reminder workflow (upload → commit → reminder sent)
- [x] 8.4 Verify tenant isolation: confirm batch operations across tenants are isolated
- [x] 8.5 Test error scenarios: invalid file formats, missing required fields, oversized uploads, malformed payment URLs
- [x] 8.6 Add cleanup job tests to verify staging data is deleted and audit trail persists

## 9. Documentation and Release

- [x] 9.1 Update docs/DDD.md to document new `ImportBatch` and `ImportStagingRow` tables
- [x] 9.2 Document import API contracts in docs/DDD.md (endpoints, request/response shapes)
- [x] 9.3 Add CSV import template documentation (required columns, data types, examples)
- [x] 9.4 Update deployment runbook with any new environment variables or config defaults
- [x] 9.5 Verify all tests pass and no regressions in existing invoice workflows
