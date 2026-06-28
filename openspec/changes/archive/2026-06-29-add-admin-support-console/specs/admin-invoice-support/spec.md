## ADDED Requirements

### Requirement: Invoice search and detail support debtor investigations
The system MUST allow admins to search invoices by invoice number, customer name, tenant, source provider ID, status, due date, and reminder state. Invoice detail MUST show invoice number, customer name, amount, due date, days overdue, source system, source system ID, paid or unpaid status, disputed status, promise-to-pay status, paused status, last reminder sent, next scheduled reminder, email delivery history, and sync history.

#### Scenario: Search returns invoices by number
- **WHEN** an admin searches for an invoice number
- **THEN** the matching invoice appears in the results

#### Scenario: Detail view includes reminder history
- **WHEN** an admin opens an invoice detail view
- **THEN** the page shows reminder and sync history

### Requirement: Invoice support actions are safe and auditable
Admins SHOULD be able to pause reminders, resume reminders, mark invoices disputed, clear dispute flags, mark invoices manually paid, re-sync invoices, exclude invoices from automation, regenerate reminder schedules, preview reminder email, send a test reminder to the tenant owner, resend reminder, and cancel queued reminder. These actions MUST be audited and SHOULD require confirmation when they can change customer-facing automation or state.

#### Scenario: Pause reminders is available
- **WHEN** an invoice is actively sending reminders incorrectly
- **THEN** the admin can pause reminders for that invoice

#### Scenario: Resync is audited
- **WHEN** an admin re-syncs an invoice
- **THEN** the invoice action is written to the audit log
