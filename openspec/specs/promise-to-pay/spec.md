# promise-to-pay Specification

## Purpose
TBD - created by archiving change promise-to-pay-tracking. Update Purpose after archive.
## Requirements
### Requirement: Client-initiated promise to pay via secure token

The system SHALL allow a client to self-commit to a payment date by visiting a unique token-based URL included in their follow-up email. The URL SHALL require no authentication. The token SHALL be a 32-byte cryptographically random hex string stored on the `TrackedInvoice` and generated on the first Business+ follow-up email sent for that invoice. The token SHALL remain stable for the lifetime of the invoice. A client-originated promise SHALL apply to exactly one invoice and SHALL represent a commitment to pay the full outstanding amount for that invoice.

The public promise flow SHALL be limited to a single invoice and SHALL not create partial-payment, instalment, or multi-invoice arrangements.

#### Scenario: Client visits promise page with valid token

- **WHEN** a client visits `/promise/[token]` with a valid token for an unpaid invoice
- **THEN** the system displays the invoice reference and a single-invoice commitment form

#### Scenario: Client visits promise page for already-paid invoice

- **WHEN** a client visits `/promise/[token]` and the invoice status is `paid` or `manually_resolved`
- **THEN** the system displays a message indicating the invoice is settled and no action is needed

#### Scenario: Client visits promise page with invalid or unknown token

- **WHEN** a client visits `/promise/[token]` with a token that does not exist in the database
- **THEN** the system displays a generic "link not found" message without exposing any invoice details

#### Scenario: Client submits a valid promise

- **WHEN** a client submits the promise form with a future date and the debtor is still below the configured broken-promise retry limit
- **THEN** the system creates a `PromiseToPay` record with `status: 'active'`, supersedes any existing `active` promise on the same invoice (setting its status to `'superseded'`), and sends a notification email to the freelancer

#### Scenario: Client submits a past date

- **WHEN** a client submits the promise form with a date in the past
- **THEN** the system rejects the submission with a validation error and prompts the client to choose a future date

#### Scenario: Client attempts to negotiate broader arrangement

- **WHEN** a client uses the public promise flow to request a partial-payment, instalment, or multi-invoice commitment
- **THEN** the system rejects the request and does not create an arrangement agreement

#### Scenario: Client exceeds promise retry limit

- **WHEN** a client submits a promise request after reaching the configured retry limit for broken client-originated promises
- **THEN** the system rejects the request and directs the client to contact the freelancer directly

---

### Requirement: Promise to pay history per invoice

The system SHALL store a full history of promise events per invoice. Each client submission SHALL create a new `PromiseToPay` record. Prior active promises SHALL be superseded, not deleted or overwritten. The history SHALL be queryable by `trackedInvoiceId` ordered by `createdAt`.

#### Scenario: Client submits a second promise on the same invoice

- **WHEN** a client submits a new promise date on an invoice that already has an `active` promise
- **THEN** the existing `active` promise is updated to `status: 'superseded'` and a new `active` promise is created

#### Scenario: Promise history is queried

- **WHEN** the system queries promises for an invoice
- **THEN** all past and current promise records are returned ordered by `createdAt` ascending

---

### Requirement: Email suppression during active promise

The system SHALL suppress scheduled follow-up emails for any invoice that has at least one `PromiseToPay` with `status: 'active'`. The invoice SHALL remain in `pending` status and SHALL resume normal email scheduling automatically once the active promise is resolved (kept, broken, or superseded by another promise that subsequently breaks).

#### Scenario: Cron skips invoice with active promise

- **WHEN** the daily cron runs and a `pending` invoice with an active promise has a `nextEmailAt` in the past
- **THEN** the cron does NOT send an email for that invoice

#### Scenario: Cron resumes emails after promise is broken

- **WHEN** a promise is marked `broken` by the cron
- **THEN** the invoice has no remaining `active` promise and subsequent cron runs will send scheduled emails normally without resetting the reminder stage

---

### Requirement: Promise breach detection and freelancer notification

The system SHALL detect broken promises during the daily cron run. A promise is broken when its `promisedPayBy` date has passed and the invoice is not in `paid` or `manually_resolved` status. On detection, the system SHALL mark the promise `status: 'broken'`, record `breachNotifiedAt`, count prior broken client-originated promises for the same debtor within the freelancer account, and send a breach notification email to the freelancer.

#### Scenario: Cron detects a broken promise

- **WHEN** the cron runs and finds a `PromiseToPay` with `status: 'active'` where `promisedPayBy < now` and the invoice is not paid or resolved
- **THEN** the promise is marked `broken`, `breachNotifiedAt` is set to the current timestamp, and a notification email is sent to the freelancer

#### Scenario: Breach notification is not sent twice

- **WHEN** the cron runs and finds a `PromiseToPay` with `status: 'broken'` that already has `breachNotifiedAt` set
- **THEN** no additional notification is sent

#### Scenario: Breach notification email content

- **WHEN** a breach notification is sent to the freelancer
- **THEN** the email SHALL include the client name, the full invoice amount, the promise date that was missed, the number of prior broken promises by that debtor within the account, and a link to the dashboard

---

### Requirement: Promise marked kept on payment

The system SHALL mark any `active` promise as `kept` when the corresponding invoice transitions to `paid` status via the Stripe Connect webhook.

#### Scenario: Invoice paid while active promise exists

- **WHEN** the Stripe Connect webhook receives `invoice.paid` for an invoice with an `active` PromiseToPay
- **THEN** the active promise is updated to `status: 'kept'`

---

### Requirement: Freelancer notified on promise receipt

The system SHALL send a notification email to the freelancer immediately when a client submits a promise.

#### Scenario: Promise receipt notification sent

- **WHEN** a client successfully submits a promise
- **THEN** the freelancer receives an email containing the client name, committed payment date, optional client note, and a link to the dashboard invoice

---

### Requirement: Dashboard promise indicators

The system SHALL display promise state on the invoice dashboard table for invoices that have an active or broken promise, and SHALL surface repeat broken promises as a prioritisation signal.

#### Scenario: Active promise badge shown

- **WHEN** an invoice has a `PromiseToPay` with `status: 'active'`
- **THEN** the dashboard invoice row displays a promise badge showing the committed payment date

#### Scenario: Broken promise warning shown

- **WHEN** an invoice has a `PromiseToPay` with `status: 'broken'` and no subsequent `active` promise
- **THEN** the dashboard invoice row displays a broken promise warning including how many prior broken promises exist for that debtor within the freelancer account

#### Scenario: High-priority debtor highlighted

- **WHEN** an invoice belongs to a debtor whose broken-promise count meets a configured escalation threshold
- **THEN** the dashboard highlights that invoice as higher priority

---

### Requirement: Promise to pay is gated to Business and Accountant Partner tiers

The system SHALL only generate P2P tokens and include promise links in emails for users whose subscription tier has `promise_to_pay_tracking: true` (Business and Accountant Partner). The public promise page SHALL remain accessible to any client with a valid token regardless of whether the freelancer's tier has since changed.

#### Scenario: Starter user does not receive P2P link in email

- **WHEN** a follow-up email is sent on behalf of a Starter-tier user
- **THEN** the email does not include a promise-to-pay link

#### Scenario: Business user email includes P2P link

- **WHEN** a follow-up email is sent on behalf of a Business-tier or Accountant Partner-tier user
- **THEN** the email includes a promise-to-pay link pointing to `/promise/[token]`

