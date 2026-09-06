## Purpose

The CSV/XLSX customer lifecycle capability gives tenants a supported import path for overdue invoices that behaves like a native PaidSoon invoice-tracking workflow. It ensures imported invoice data is validated, stored with the right lifecycle state, followed up on while due, and stopped correctly once the invoice is paid without requiring a live accounting sync.

## ADDED Requirements

### Requirement: Imported invoices follow the same tracked lifecycle as native invoices
The system SHALL treat imported CSV/XLSX invoice records as tracked invoices for status, reminders, and reconciliation purposes.

#### Scenario: Imported invoice enters active chase workflow
- **WHEN** a valid CSV/XLSX import is committed
- **THEN** the imported invoice is stored as a tenant-scoped tracked invoice
- **AND** it is evaluated against the same due-date, reminder, and escalation logic as other invoices

#### Scenario: Payment updates imported invoice state
- **WHEN** an imported invoice is marked paid or fully reconciled
- **THEN** the system updates its tracked state
- **AND** it no longer receives further reminder emails or follow-up actions

### Requirement: CSV/XLSX import provides operational safety and auditability
The system SHALL keep imported invoice data reviewable and safe enough to support production customer use without a live accounting integration.

#### Scenario: Malformed or duplicate imports fail safely
- **WHEN** an import batch contains malformed rows, duplicate invoice keys, or invalid payment metadata
- **THEN** the import is rejected or limited to safe rows
- **AND** the tenant sees the blocking reason and a reconciled count

#### Scenario: Payment metadata is preserved for follow-up actions
- **WHEN** a CSV/XLSX import includes a payment URL or other customer payment metadata
- **THEN** the system persists the relevant data in the tracked invoice record
- **AND** reminder templates can display a valid pay action when available
