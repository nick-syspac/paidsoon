## ADDED Requirements

### Requirement: Freelancer can view full email content from the dashboard
The system SHALL allow a freelancer to click a sent-email entry in an invoice's email
history and view that email's full rendered content (subject, from-address, sent date,
and body) in a modal window.

#### Scenario: Email sent after this feature was released
- **WHEN** a freelancer clicks an email history entry whose stored `EmailLog` row has a
  persisted body
- **THEN** the system opens a modal showing the subject, from-address, sent date, and
  the full rendered body of that email

#### Scenario: Email sent before this feature was released
- **WHEN** a freelancer clicks an email history entry whose stored `EmailLog` row has no
  persisted body
- **THEN** the system opens a modal showing the available metadata (subject,
  from-address, sent date) and a message indicating the content is not available for
  emails sent before this feature was added

#### Scenario: Custom-template HTML content is rendered safely
- **WHEN** the persisted email body originates from a freelancer's custom `EmailTemplate`
- **THEN** the system sanitizes the HTML before rendering it in the modal

### Requirement: Sent email content is persisted for later viewing
The system SHALL persist the actual rendered subject and body of each sent reminder
email so it can be retrieved and displayed later without re-rendering from templates or
invoice data.

#### Scenario: Reminder email is sent
- **WHEN** the cron sends a stage 1, 2, or 3 reminder email for a tracked invoice
- **THEN** the system stores the rendered HTML body and text body alongside the existing
  `EmailLog` record for that send

### Requirement: Freelancer can view full arrangement detail from the dashboard
The system SHALL allow a freelancer to click an arrangement summary on an invoice row
and view the arrangement's full detail — including every invoice it covers — in a modal
window.

#### Scenario: Arrangement covers a single invoice
- **WHEN** a freelancer clicks the arrangement summary for an invoice covered by a
  single-invoice arrangement
- **THEN** the system opens a modal showing the arrangement's type, status, repayment
  terms, target date, terms/notes, and the one covered invoice

#### Scenario: Arrangement covers multiple invoices
- **WHEN** a freelancer clicks the arrangement summary for an invoice covered by a
  multi-invoice arrangement
- **THEN** the system opens a modal showing the arrangement's full detail and the
  complete list of every invoice it covers, not only the invoice on the clicked row

#### Scenario: Arrangement detail request is scoped to the requesting user
- **WHEN** the dashboard requests full arrangement detail for a given arrangement id
- **THEN** the system returns that detail only if the arrangement belongs to the
  authenticated user, and otherwise denies the request

### Requirement: Detail modal is dismissible
The system SHALL let a freelancer close an open detail modal (email or arrangement)
using a visible close button, without navigating away from the dashboard.

#### Scenario: Freelancer closes the modal
- **WHEN** a freelancer clicks the modal's close button, clicks outside the modal, or
  presses Escape while a detail modal is open
- **THEN** the system closes the modal and returns focus to the dashboard invoice table
