## Why

PaidSoon currently relies on accounting-system integrations or manual data entry to collect invoice records, which creates a high-friction onboarding path for businesses that are not yet connected to Xero or MYOB, are using unsupported software, or only need a quick periodic accounts-receivable import. This change adds a tenant-safe spreadsheet import flow that lets users bring in invoice data without creating a live accounting connection and without sending reminders until the user explicitly reviews and activates them.

## What Changes

- New tenant-scoped import workflow for CSV and XLSX invoice uploads from the invoice/debtors area
- Downloadable CSV and XLSX starter templates with canonical headings and fictional sample rows
- Guided mapping UI that suggests common invoice-field aliases, supports manual correction, and preserves saved mapping profiles per tenant
- Server-side validation and preview before any customer or invoice records are changed
- Duplicate handling modes that default to skip-existing and protect historical reminder and dispute state during safe updates
- Atomic import-batch processing with idempotent commit semantics and no reminder dispatch during import
- Retention controls for uploaded files and staging data, plus audit metadata for import history and errors

## Capabilities

### New Capabilities
- `invoice-import`: spreadsheet import workflow for tenant-scoped CSV/XLSX invoice ingestion, mapping, validation, preview, and batch commit

### Modified Capabilities
- None

## Impact

- Adds new API endpoints and data models in the invoice-import area, alongside the existing invoice and customer workflows
- Requires Prisma schema additions for import batches, mapping profiles, temporary staging rows, and sanitised error records
- Introduces a safe spreadsheet parsing layer built around tenant-scoped uploads, file-size checks, workbook inspection, and schema-versioned templates
- Reuses existing PaidSoon invoice/customer models and reminder safety rules so imported records are created in a paused state and never trigger reminder emails automatically
- Increases operational and security concerns around temporary file retention, validation, approval flows, and tenant isolation; these are addressed through RLS, server-side authorization, and cleanup rules
