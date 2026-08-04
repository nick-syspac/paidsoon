# PaidSoon Customer Release Notes

This file is customer-facing and chronological, with newest releases first.

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
