## ADDED Requirements

### Requirement: Email delivery state is inspectable
The system MUST allow admins to inspect sent emails, queued emails, failed emails, bounced emails, blocked or suppressed recipients, unsubscribe status, complaint or spam report status if available, email provider error messages, sender domain status, and SPF, DKIM, and DMARC verification status.

#### Scenario: Delivery history is visible
- **WHEN** an admin opens the email delivery view
- **THEN** the page shows the delivery state and failure details

#### Scenario: Recipient data stays bounded
- **WHEN** the email delivery view renders
- **THEN** it does not expose more recipient data than needed for support

### Requirement: Email delivery actions are safe and reasoned
Admins SHOULD be able to retry failed email, resend email, send test email, verify sender domain, remove a recipient from suppression with confirmation, pause tenant email sending, and switch a tenant to the default PaidSoon sender. These actions MUST be audited.

#### Scenario: Suppression removal requires confirmation
- **WHEN** an admin removes a recipient from suppression
- **THEN** the action requires confirmation and is audited

#### Scenario: Tenant sender switch is audited
- **WHEN** an admin switches the tenant to the default sender
- **THEN** the sender change is recorded in the audit log
