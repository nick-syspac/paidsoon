## Why

The repo includes CSV/XLSX invoice import and export tooling, but the release audit shows that the end-to-end lifecycle for non-accounting-integration customers is not proven. For a paying customer, the real requirement is not merely that files can be uploaded; it is that a customer can import unpaid invoices, let PaidSoon chase them, receive payment, and then stop chasing without operator intervention. Without that proof, the CSV/XLSX path is not safe to sell as a core customer workflow.

## What Changes

- Define the supported CSV/XLSX customer workflow end-to-end, from import through payment reconciliation to stop-chasing behavior.
- Verify how imported invoices are updated, marked paid, and reconciled after payment.
- Confirm the reminder engine stops sending for paid invoices in the CSV/XLSX path.
- Document the exact status transitions and failure handling for duplicate, malformed, or partially imported invoices.
- Add a release-grade end-to-end test covering the complete workflow.

## Capabilities

### New Capabilities
- `csv-xlsx-customer-lifecycle`: a verified lifecycle for customers not using live accounting integrations.

### Modified Capabilities
- `invoice-import-reconciliation`: strengthen the import and payment synchronization path so imported invoices behave like native tracked invoices.
- `reminder-stop-after-payment`: ensure reminder scheduling is suppressed when a CSV/XLSX imported invoice is paid.

## Impact

- Affected code:
  - `lib/invoiceImport/parser.ts`
  - import route handlers under `app/api/invoice-imports/`
  - invoice payment reconciliation logic under `lib/invoices/`
  - reminder engine and stop-condition logic
- Affected systems:
  - manual CSV/XLSX customer workflows, imported invoice lifecycle, reminder suppression, payment reconciliation
- No schema migration required unless this proposal uncovers a missing source-of-truth field.
- This is a production-readiness and customer-trust issue.

## Release Criteria

- A customer can import a valid CSV/XLSX file and have those invoices behave as tracked invoices in the chase lifecycle.
- Payment reconciliation stops reminders correctly.
- Duplicate or malformed input fails safely and predictably.
- A release test covers the exact workflow from invoice import to payment to stop-chasing.
