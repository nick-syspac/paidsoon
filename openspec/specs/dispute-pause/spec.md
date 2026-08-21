# dispute-pause Specification

## Purpose
Lets a business owner mark an invoice as disputed, automatically halting reminder emails until the dispute is resolved, without losing the invoice's reminder history in the process.
## Requirements
### Requirement: Marking an invoice as disputed halts its reminder sequence
The system SHALL allow a user to mark one of their own invoices as `disputed`, capturing an optional note and the time it was raised, and SHALL exclude that invoice from all future reminder sends while it remains disputed.

#### Scenario: User disputes an invoice
- **WHEN** a user marks an active invoice as disputed with the note "client says goods not delivered"
- **THEN** the invoice's status becomes `disputed`, `disputeNote` stores the note, and `disputeRaisedAt` is set to the current time

#### Scenario: Reminder cron skips disputed invoices
- **WHEN** the reminder cron runs and an invoice's status is `disputed`
- **THEN** no reminder email is sent for that invoice

### Requirement: Disputed invoices are distinguishable from ordinary manual pauses
The system SHALL represent a disputed invoice as its own status value, distinct from a plain manual pause, so it can be counted, filtered, and displayed separately from other paused invoices.

#### Scenario: Dashboard distinguishes dispute from pause
- **WHEN** an invoice is disputed
- **THEN** it is shown with a "Disputed" indicator distinct from the "Paused" indicator shown for invoices paused for other reasons

### Requirement: Resolving a dispute returns the invoice to normal chase behavior
The system SHALL allow a user to resolve a disputed invoice, clearing its dispute fields and returning its status to `pending` so the reminder sequence resumes according to the existing schedule.

#### Scenario: User resolves a dispute
- **WHEN** a user resolves a disputed invoice
- **THEN** the invoice's status becomes `pending`, `disputeResolvedAt` is set to the current time, and reminders resume on the tenant's normal schedule

### Requirement: Dispute actions are tenant-isolated
The system SHALL only allow a user to dispute or resolve invoices belonging to their own tenant, enforced the same way as other invoice-status mutations.

#### Scenario: Cross-tenant dispute attempt
- **WHEN** a user attempts to dispute an invoice belonging to a different tenant
- **THEN** the request is rejected and no invoice status changes

