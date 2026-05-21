## ADDED Requirements

### Requirement: Three pre-written escalating email templates are used for follow-up sequences
The system SHALL use exactly three pre-written, psychology-backed email templates for follow-up sequences. Templates SHALL NOT be user-editable at MVP. The tone escalates: Stage 1 is friendly, Stage 2 is professional, Stage 3 is firm.

**Stage 1 — Friendly:**
> Subject: Quick note on Invoice [#NUMBER]
>
> Hi [CLIENT_NAME],
>
> Just a quick heads-up that Invoice [#NUMBER] for [AMOUNT] became due on [DUE_DATE]. Things get busy — totally understand! Here's the link to pay when you get a moment:
>
> [PAYMENT_LINK]
>
> Thanks so much,
> [FREELANCER_NAME]

**Stage 2 — Professional:**
> Subject: Following up: Invoice [#NUMBER] — [AMOUNT] Outstanding
>
> Hi [CLIENT_NAME],
>
> I'm following up on Invoice [#NUMBER] for [AMOUNT], which was due on [DUE_DATE] and remains outstanding. Could you let me know when we can expect payment, or if there are any questions I can help with?
>
> [PAYMENT_LINK]
>
> Best,
> [FREELANCER_NAME]

**Stage 3 — Firm:**
> Subject: Invoice [#NUMBER] — [AMOUNT] Now [DAYS_OVERDUE] Days Overdue
>
> Dear [CLIENT_NAME],
>
> I'm writing regarding Invoice [#NUMBER] for [AMOUNT], which is now [DAYS_OVERDUE] days past its due date of [DUE_DATE]. Per our agreement, payment was expected on that date.
>
> Please arrange payment via the link below by [DUE_DATE + 7 days], or contact me immediately to discuss.
>
> [PAYMENT_LINK]
>
> [FREELANCER_NAME]

#### Scenario: Stage 1 email rendered
- **WHEN** the cron job sends a Stage 1 email for a tracked invoice
- **THEN** the email SHALL use the Stage 1 template with all placeholders replaced with actual invoice data

#### Scenario: Stage 3 email rendered
- **WHEN** the cron job sends a Stage 3 email for a tracked invoice
- **THEN** the email SHALL use the Stage 3 (firm) template and SHALL include the number of days overdue and a firm deadline of due date + 7 days

---

### Requirement: Cron job dispatches pending emails daily
The system SHALL run a Vercel Cron job daily at 09:00 UTC. The cron job SHALL query all `tracked_invoices` where `status = 'pending'` AND `nextEmailAt <= now` and dispatch the appropriate stage email for each.

#### Scenario: Pending invoice is due for email
- **WHEN** the cron runs and finds a tracked invoice with `status: 'pending'` and `nextEmailAt <= now`
- **THEN** the system sends the email for the current stage, logs it in `email_logs`, increments `currentStage`, and updates `nextEmailAt` based on the user's schedule

#### Scenario: Sequence completes after Stage 3
- **WHEN** the cron sends the Stage 3 email
- **THEN** `status` is set to `sequence_complete` and no further emails are sent for that invoice

#### Scenario: Paused or snoozed invoice is skipped
- **WHEN** the cron runs and encounters a `paused` or `snoozed` invoice
- **THEN** no email is sent for that invoice

#### Scenario: Paid invoice is skipped
- **WHEN** the cron runs and encounters a `paid` or `manually_resolved` invoice
- **THEN** no email is sent

---

### Requirement: Email dispatch is logged
The system SHALL create an `email_logs` record for every email successfully sent, capturing stage, timestamp, Resend message ID, from-address used, and subject line.

#### Scenario: Email sent successfully
- **WHEN** Resend accepts an outbound email
- **THEN** an `email_logs` record is created with the Resend message ID and all relevant metadata

#### Scenario: Resend returns an error
- **WHEN** Resend returns an error for an outbound email
- **THEN** the system SHALL log the error, SHALL NOT update the invoice's `currentStage` or `nextEmailAt`, and SHALL NOT create an `email_logs` record for that send
