## 1. Import Lifecycle Alignment

- [x] 1.1 Confirm the CSV/XLSX commit path creates or updates tracked invoices using the same model as native invoice sources.
- [x] 1.2 Verify payment metadata from the import is retained in the authoritative tracked invoice record.
- [x] 1.3 Confirm due-date and reminder eligibility for imported invoices uses shared invoice-status logic rather than import-only checks.

## 2. Payment Reconciliation And Reminder Suppression

- [x] 2.1 Add or adjust the shared reconciliation path so a paid imported invoice is marked resolved and no longer eligible for reminders.
- [x] 2.2 Ensure reminder generation checks the current invoice state before sending a message for an imported invoice.
- [x] 2.3 Validate `paymentUrl` still renders a pay link while the invoice is overdue and is omitted after payment resolution.

## 3. Validation And Safety Checks

- [x] 3.1 Add a regression test covering a valid CSV/XLSX import that reaches the reminder workflow.
- [x] 3.2 Add a regression test covering invoice payment reconciliation for an imported invoice and verification that no reminder is sent afterward.
- [x] 3.3 Add a safety test for malformed or duplicate import rows to ensure the workflow fails predictably without creating invalid invoice state.

## 4. Release Proof

- [x] 4.1 Run the targeted test suite for invoice import and reminder behavior.
- [x] 4.2 Review the import audit trail and invoice status transitions to confirm imported records remain tenant-scoped and consistent.
- [x] 4.3 Confirm the release gate is satisfied: CSV/XLSX customer lifecycle is proven rather than assumed.
