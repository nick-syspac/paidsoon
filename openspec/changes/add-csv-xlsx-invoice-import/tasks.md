## 1. Data model and access controls

- [x] 1.1 Add import-batch, mapping-profile, staging-row, and error models to the Prisma schema
- [x] 1.2 Add tenant-scoped indexes, uniqueness rules, and status fields for validation and commit lifecycle
- [ ] 1.3 Add source metadata on imported customer and invoice records and ensure tenant-scoped permission checks are enforced by the service layer
- [ ] 1.4 Define cleanup retention rules for raw uploads and staging rows and align them with the existing audit policy

## 2. Template generation and parser foundation

- [x] 2.1 Define canonical invoice-import field schema and version metadata for template compatibility checks
- [x] 2.2 Implement CSV template generation with fictional sample rows and a non-deliverable email domain
- [x] 2.3 Implement XLSX template generation with Instructions and Invoices worksheets plus format guidance
- [x] 2.4 Build safe CSV/XLSX parsing utilities with file-type, extension, signature, and size validation
- [x] 2.5 Reject unsupported, encrypted, malformed, macro-enabled, or formula-heavy files before any application records are touched

## 3. Mapping, preview, and validation flows

- [x] 3.1 Detect worksheet headers and map them to canonical invoice fields with alias suggestions and manual override support
- [x] 3.2 Support saved mapping profiles per tenant and only reapply them when headings remain compatible
- [x] 3.3 Implement format selection for date, number, currency, and delimiter handling with explicit ambiguity prompts
- [x] 3.4 Validate required fields, date ranges, currency codes, email/URL integrity, duplicate invoice identifiers, and over-limit values server-side
- [x] 3.5 Produce preview counts, warning rows, skipped rows, and row-level error reports without exposing raw sensitive values in logs

## 4. Duplicate handling and matching rules

- [ ] 4.1 Implement tenant-scoped customer matching order: external ID, then email, then create new customer with conflict detection
- [ ] 4.2 Implement tenant-scoped invoice matching order: external ID, then invoice number, with blocking conflict handling
- [ ] 4.3 Add default Skip Existing mode and report existing matches as skipped without altering reminder history
- [ ] 4.4 Add Update Eligible Existing Invoices mode with field allowlist and protection against reopening terminal states
- [ ] 4.5 Ensure imported invoice creation sets reminders to paused state and cannot trigger reminder events during import

## 5. API and batch lifecycle

- [ ] 5.1 Implement `GET /api/invoice-imports/template?format=csv|xlsx` and template download endpoints
- [ ] 5.2 Implement upload creation route and batch status lifecycle (`uploaded`, `mapping`, `validated`, `processing`, `completed`, `failed`, `cancelled`)
- [ ] 5.3 Implement mapping save/submit route and validation route for staging rows and final preview
- [ ] 5.4 Implement idempotent commit route that performs atomic batch creation and returns existing result on repeat requests
- [ ] 5.5 Implement status and error-report retrieval routes for review and audit workflows
- [ ] 5.6 Add import-mapping profile collection endpoints for per-tenant save/reuse patterns

## 6. UI and review experience

- [ ] 6.1 Add a dedicated Settings > Import tab as the central setup area for CSV/XLSX invoice import, separate from the live accounting connections flow
- [ ] 6.2 Add Import invoices entry point and guided flow in the invoice/debtors area
- [ ] 6.3 Add template download actions, file upload, sheet selection, and mapping review steps
- [ ] 6.4 Add validation summary panel with blocking errors, warnings, skipped rows, and first-preview sample rows
- [ ] 6.5 Add final confirmation page that clearly states no reminders were sent and that activation remains an explicit follow-up action
- [ ] 6.6 Add import history listing with batch status, counts, and error-report access for the tenant user

## 7. Testing, safety, and rollout

- [ ] 7.1 Add unit and integration tests for CSV parsing, XLSX parsing, template compatibility, header aliases, and date/number parsing edge cases
- [ ] 7.2 Add tests for validation failures, duplicate detection, tenant isolation, idempotent commit behavior, and atomic rollback
- [ ] 7.3 Add tests proving imported invoices remain paused and do not generate reminder emails or enqueue follow-up events
- [ ] 7.4 Add security-focused tests covering malformed files, formula injection, permission denial, and cleanup retention windows
- [ ] 7.5 Ship behind a feature flag and pilot with internal/demo tenants before broader rollout
