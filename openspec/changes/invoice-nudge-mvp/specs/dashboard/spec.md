## ADDED Requirements

### Requirement: Dashboard displays all overdue invoices with sequence status
The system SHALL display a list of all overdue invoices detected from connected invoice sources. Each invoice SHALL show: invoice number, client name, amount due, days overdue, current sequence stage (e.g., "2 of 3"), and next email date.

#### Scenario: Tracked invoices shown with status
- **WHEN** an authenticated user views the dashboard
- **THEN** all tracked invoices with `status` in `['pending', 'paused', 'snoozed', 'sequence_complete']` are shown with their current stage and next send date

#### Scenario: Paid and resolved invoices not shown by default
- **WHEN** an authenticated user views the dashboard
- **THEN** invoices with `status: 'paid'` or `status: 'manually_resolved'` are NOT shown in the main list (accessible via a "Resolved" filter)

---

### Requirement: Free tier upgrade prompt is shown when at or near the invoice limit
The system SHALL display an upgrade prompt when a Free-tier user has 3 active tracked invoices and additional untracked overdue invoices exist. The prompt SHALL display the count and total dollar value of untracked invoices.

#### Scenario: Free user at limit with untracked invoices
- **WHEN** a Free-tier user views the dashboard and has untracked overdue invoices
- **THEN** the system displays a banner: "X more overdue invoices detected — $Y in untracked revenue — Upgrade to Pro"

---

### Requirement: User can pause a sequence from the dashboard
The system SHALL provide a "Pause" action on each pending tracked invoice in the dashboard.

#### Scenario: Pause from dashboard
- **WHEN** a user clicks "Pause" on a pending invoice
- **THEN** `status` is set to `paused` and the row updates to reflect the paused state immediately

---

### Requirement: User can snooze a sequence from the dashboard
The system SHALL provide a "Snooze 7 days" action on each pending tracked invoice. Snoozed invoices SHALL display their snooze expiry date in the dashboard.

#### Scenario: Snooze from dashboard
- **WHEN** a user clicks "Snooze 7 days" on a pending invoice
- **THEN** `status` is set to `snoozed`, `snoozedUntil` is set to now + 7 days, and the row shows the snooze expiry date

---

### Requirement: User can mark an invoice as resolved from the dashboard
The system SHALL provide a "Mark as resolved" action on each active tracked invoice.

#### Scenario: Resolve from dashboard
- **WHEN** a user clicks "Mark as resolved" and confirms the action
- **THEN** `status` is set to `manually_resolved` and the invoice moves out of the main list

---

### Requirement: Dashboard shows email history for each invoice
The system SHALL allow a user to expand a tracked invoice to view the log of emails sent, including stage, sent date, and from-address used.

#### Scenario: Expand invoice to view email history
- **WHEN** a user expands a tracked invoice row on the dashboard
- **THEN** the system shows all `email_logs` records for that invoice ordered by `sentAt` ascending

---

### Requirement: Dashboard links to account settings
The system SHALL provide navigation to: Schedule settings, Email settings, Stripe connection status, and Subscription/billing management.

#### Scenario: Settings navigation
- **WHEN** an authenticated user clicks the settings link in the dashboard nav
- **THEN** they are taken to the settings page which includes tabs or sections for each settings area
