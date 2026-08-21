# PaidSoon Customer Release Notes

This file is customer-facing and chronological, with newest releases first.

## Release v0.3.0 - 2026-08-11

- Internal reference ID: REL-2026-08-11-v0.3.0
- Audience: customers
- Support impact: low

### Summary
Small Business and Accountant Partner customers can now export their invoices to CSV or XLSX, with filters for status, customer, accounting source, and date range.

### New
- Added invoice export to CSV or XLSX, available from the Invoices dashboard toolbar and a new Settings → Invoice exports screen with advanced filters.

### Improved
- Improved the pricing page to reflect invoice export as an available feature rather than "coming soon" on the Small Business and Accountant Partner plans.

### Fixed
- N/A

### Security and Reliability
- Export requests are scoped per tenant and gated by plan entitlement; a row-count ceiling protects against unbounded file generation.

### Known Limitations
- The XLSX file's header row is not frozen (a limitation of the underlying spreadsheet library); column filters and widths are still applied.

### Rollout Notes
This release is available immediately to all current private beta users.

---

## Release v0.2.0 - 2026-08-04

- Internal reference ID: REL-2026-08-04-v0.2.0
- Audience: customers
- Support impact: low

### Summary
PaidSoon has improved invoice follow-up clarity and reliability, with clearer dashboard actions and more predictable reminder behavior.

### New
- Added clearer promise-to-pay tracking states so you can see when a customer has committed to a payment date.
- Added improved guidance in help content for common reminder workflow actions.

### Improved
- Improved dashboard summary wording so overdue invoice status is easier to interpret at a glance.
- Improved reminder flow consistency when invoices are manually resolved.

### Fixed
- Fixed an issue where some reminder-state updates could appear delayed in the dashboard.
- Fixed minor copy inconsistencies across follow-up status labels.

### Security and Reliability
- Improved server-side validation on reminder and arrangement update paths to reduce invalid state transitions.
- Improved processing safeguards to reduce duplicate follow-up actions under retry conditions.

### Known Limitations
- MYOB Business support remains early access in some workflows.
- Public API documentation is still in progress.

### Rollout Notes
This release is available immediately to all current private beta users.

---

## Release Template

Copy this template for each new release and place it above older entries.

## Release vX.Y.Z - YYYY-MM-DD

- Internal reference ID: REL-YYYY-MM-DD-vX.Y.Z
- Audience: customers
- Support impact: low | medium | high

### Summary
One to two sentences describing customer-visible outcomes.

### New
- Item

### Improved
- Item

### Fixed
- Item

### Security and Reliability
- Item

### Known Limitations
- Item (optional)

### Rollout Notes
- Item (optional)
