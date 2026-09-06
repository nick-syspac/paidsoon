## Why

Businesses that don't have a live accounting sync or use unsupported platforms need a safe, reviewable way to bring in invoice records. CSV/XLSX import provides a spreadsheet-based alternative to live sync, enabling reminder workflows to operate immediately on imported data without requiring pre-existing integrations. Additionally, imported invoices must support payment links in reminder emails to reduce friction in payment collection—a capability currently only available for Stripe-connected invoices.

## What Changes

- **Add CSV/XLSX invoice import workflow**: Users can upload expense files, map columns, validate rows server-side, and commit them as tracked invoices
- **Extend invoice validation and commit pipeline**: Imported rows are subject to the same lifecycle rules as other invoice sources (Stripe, manual entry)
- **Enhance reminder email payment link support**: Payment URLs are now preserved and rendered in reminder emails for imported invoices, not just Stripe-connected ones
- **Implement tenant-safe batch lifecycle**: Import metadata is retained for audit trails while temporary upload data is cleaned up according to retention policy
- **Add payment metadata preservation**: CSV-imported invoices can include payment URLs alongside customer and invoice data

## Capabilities

### New Capabilities

None—all behavior changes are extensions to existing invoice-handling capabilities.

### Modified Capabilities

- `invoice-import`: Enhanced validation, safe commit behavior, and tenant-scoped batch lifecycle for CSV/XLSX imports
- `reminder-payment-link`: Extended to support payment links for imported invoices, not just Stripe-connected invoices

## Impact

- **Database**: Invoice import staging schema, batch metadata tables, and validation error logging
- **APIs**: New upload, mapping, validation, and commit endpoints under `/api/invoices/import/*`
- **Frontend**: Import UI with file selection, column mapping, preview, and validation feedback
- **Email**: Reminder templates now render payment links for all invoice sources (Stripe + CSV/XLSX imports)
- **Workflows**: Import batches are versioned and auditable; imported invoices trigger the same reminder workflows as other sources
