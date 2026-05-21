## ADDED Requirements

### Requirement: Overdue invoices are automatically detected and tracked
The system SHALL detect overdue Stripe invoices via webhook events (`invoice.payment_overdue`) and create a `tracked_invoices` record with `status: 'pending'` and `currentStage: 0`. The system SHALL also run a daily catch-up scan to detect overdue invoices not yet tracked.

#### Scenario: Webhook triggers overdue invoice tracking
- **WHEN** Stripe sends an `invoice.payment_overdue` event for a connected account
- **THEN** the system creates a `tracked_invoices` record for that invoice if one does not already exist

#### Scenario: Daily catch-up scan finds untracked overdue invoice
- **WHEN** the daily cron job runs and finds a Stripe invoice that is overdue but has no corresponding `tracked_invoices` record
- **THEN** the system creates a `tracked_invoices` record for it

#### Scenario: Already-tracked invoice is not duplicated
- **WHEN** an overdue event arrives for an invoice that already has a `tracked_invoices` record
- **THEN** the system SHALL NOT create a duplicate record

---

### Requirement: Free tier is limited to 3 simultaneously tracked invoices
On the Free tier, the system SHALL NOT track more than 3 invoices with `status: 'pending'` or `status: 'snoozed'` simultaneously. Additional overdue invoices SHALL be detected and surfaced in the dashboard as "untracked" with an upgrade prompt.

#### Scenario: Free user at limit — new overdue invoice detected
- **WHEN** a free-tier user already has 3 active tracked invoices and a new overdue invoice is detected
- **THEN** the system SHALL NOT create a new `tracked_invoices` record for it, but SHALL surface it in the dashboard as "untracked, upgrade to track"

#### Scenario: Pro user has no tracking limit
- **WHEN** a Pro-tier user has any number of overdue invoices detected
- **THEN** all SHALL be tracked without restriction

---

### Requirement: Payment events stop the follow-up sequence
The system SHALL listen for `invoice.paid` Stripe webhook events and update the corresponding `tracked_invoices` record to `status: 'paid'`, halting any further email sends.

#### Scenario: Invoice paid — sequence stops
- **WHEN** Stripe sends an `invoice.paid` event for a tracked invoice
- **THEN** the system sets `status: 'paid'` on the `tracked_invoices` record and no further emails are sent for that invoice

---

### Requirement: Freelancer can manually mark an invoice as resolved
The system SHALL allow a freelancer to mark a tracked invoice as manually resolved (e.g., paid via bank transfer or outside Stripe), setting `status: 'manually_resolved'` and stopping the sequence.

#### Scenario: Manual resolve
- **WHEN** a user clicks "Mark as resolved" on a tracked invoice
- **THEN** `status` is set to `manually_resolved` and the sequence stops permanently

---

### Requirement: Freelancer can pause and resume a tracked invoice sequence
The system SHALL allow a freelancer to pause an active tracked invoice sequence, setting `status: 'paused'`. Paused sequences SHALL NOT send emails until the freelancer resumes them.

#### Scenario: Pause a sequence
- **WHEN** a user clicks "Pause" on a tracked invoice with `status: 'pending'`
- **THEN** `status` is set to `paused` and no further emails are sent

#### Scenario: Resume a paused sequence
- **WHEN** a user clicks "Resume" on a tracked invoice with `status: 'paused'`
- **THEN** `status` is set back to `pending` and the next email will send on the next cron run where `nextEmailAt <= now`

---

### Requirement: Freelancer can snooze a tracked invoice sequence
The system SHALL allow a freelancer to snooze a tracked invoice for 7 days, setting `status: 'snoozed'` and `snoozedUntil` to 7 days from now. The cron job SHALL automatically resume snoozed invoices when `snoozedUntil` has passed.

#### Scenario: Snooze a sequence
- **WHEN** a user clicks "Snooze 7 days" on a tracked invoice
- **THEN** `status` is set to `snoozed`, `snoozedUntil` is set to now + 7 days, and no emails are sent until that date

#### Scenario: Snooze expires
- **WHEN** the daily cron runs and finds a `snoozed` invoice where `snoozedUntil <= now`
- **THEN** `status` is set to `pending`, `snoozedUntil` is cleared, and normal sequence processing resumes
