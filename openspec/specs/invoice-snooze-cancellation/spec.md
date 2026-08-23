# invoice-snooze-cancellation Specification

## Purpose
TBD - created by archiving change add-cancel-snooze-action. Update Purpose after archive.
## Requirements
### Requirement: Freelancer can cancel an invoice's snooze early
The system SHALL allow a freelancer to manually cancel an in-progress snooze
on a `TrackedInvoice` they own, before its `snoozedUntil` date elapses,
returning the invoice to normal reminder eligibility immediately.

#### Scenario: Cancelling snooze on a snoozed invoice
- **WHEN** an authenticated user calls `POST /api/invoices/[id]/cancel-snooze`
  for an invoice they own with `status: "snoozed"`
- **THEN** the invoice's `status` is set to `pending` and `snoozedUntil` is
  cleared to `null`, and the invoice resumes normal reminder-sequence
  eligibility at its existing `currentStage`

#### Scenario: Cannot cancel snooze on a non-snoozed invoice
- **WHEN** an authenticated user calls `POST /api/invoices/[id]/cancel-snooze`
  for an invoice whose `status` is not `snoozed` (e.g. `pending`, `paused`,
  `manually_resolved`)
- **THEN** the system SHALL respond with 404 and SHALL NOT modify the
  invoice

#### Scenario: Cannot cancel snooze on another user's invoice
- **WHEN** an authenticated user calls `POST /api/invoices/[id]/cancel-snooze`
  for an invoice owned by a different user
- **THEN** the system SHALL respond with 404 and SHALL NOT modify the
  invoice

#### Scenario: Unauthenticated request is rejected
- **WHEN** `POST /api/invoices/[id]/cancel-snooze` is called without an
  authenticated session
- **THEN** the system SHALL respond with 401 and SHALL NOT modify the
  invoice

### Requirement: Bulk dashboard actions require full-selection eligibility
The dashboard's bulk invoice-action controls (Snooze, Pause, Resume, Cancel
snooze, Resolve) SHALL only be enabled when every currently selected invoice
is in a status eligible for that action.

#### Scenario: Cancel snooze button enabled for an all-snoozed selection
- **WHEN** every invoice in the current selection has `status: "snoozed"`
- **THEN** the "Cancel snooze" button SHALL be enabled

#### Scenario: Cancel snooze button disabled for a mixed-status selection
- **WHEN** the current selection includes at least one invoice whose status
  is not `snoozed`
- **THEN** the "Cancel snooze" button SHALL be disabled

### Requirement: Bulk action failures are surfaced to the user
When a bulk dashboard invoice action is performed and any individual
invoice's request does not succeed, the system SHALL surface a visible
error to the user rather than silently proceeding as if the action
succeeded for all selected invoices.

#### Scenario: One invoice in a bulk action fails
- **WHEN** a user performs a bulk action across multiple selected invoices
  and at least one request in the batch returns a non-2xx response
- **THEN** the dashboard SHALL display an error indicating the action did
  not fully succeed, instead of silently refreshing as if it had

