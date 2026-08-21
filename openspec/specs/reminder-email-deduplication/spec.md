# reminder-email-deduplication Specification

## Purpose

Defines the guarantee that at most one reminder email is sent per tracked
invoice and stage, and how the system detects and handles duplicate send
attempts.

## Requirements

### Requirement: At most one email log per invoice and stage
The system SHALL NOT persist more than one `EmailLog` row for the same
`(trackedInvoiceId, stage)` pair.

#### Scenario: Duplicate send attempt is rejected at the data layer
- **WHEN** two send attempts for the same `(trackedInvoiceId, stage)` pair
  are made, even concurrently
- **THEN** only one `EmailLog` row exists for that pair afterward, and the
  losing attempt does not send a second email to the client

### Requirement: Skip sending when a reminder was already logged
The system SHALL check for an existing `EmailLog` row for the target
`(trackedInvoiceId, stage)` pair before sending a reminder email, and SHALL
skip the send — without failing the entire cron run — when one already
exists.

#### Scenario: Reminder already sent for this stage
- **WHEN** the reminder cron processes an invoice whose current stage
  already has a matching `EmailLog` row
- **THEN** no new email is sent for that invoice/stage, and the invoice's
  stage/schedule state still advances consistently with a completed send

#### Scenario: No prior log exists
- **WHEN** the reminder cron processes an invoice/stage with no matching
  `EmailLog` row
- **THEN** the reminder email is sent and exactly one `EmailLog` row is
  created for that `(trackedInvoiceId, stage)` pair
