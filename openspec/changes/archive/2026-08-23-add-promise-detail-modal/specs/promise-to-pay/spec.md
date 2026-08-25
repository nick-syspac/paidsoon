## MODIFIED Requirements

### Requirement: Dashboard promise indicators

The system SHALL display promise state on the invoice dashboard table for invoices that have
an active or broken promise, and SHALL surface repeat broken promises as a prioritisation
signal. Each promise indicator badge SHALL be clickable and SHALL open a read-only detail view
showing the full promise history for that invoice, rendered from already-loaded invoice data
with no additional network request.

#### Scenario: Active promise badge shown

- **WHEN** an invoice has a `PromiseToPay` with `status: 'active'`
- **THEN** the dashboard invoice row displays a promise badge showing the committed payment date

#### Scenario: Broken promise warning shown

- **WHEN** an invoice has a `PromiseToPay` with `status: 'broken'` and no subsequent `active` promise
- **THEN** the dashboard invoice row displays a broken promise warning including how many prior broken promises exist for that debtor within the freelancer account

#### Scenario: High-priority debtor highlighted

- **WHEN** an invoice belongs to a debtor whose broken-promise count meets a configured escalation threshold
- **THEN** the dashboard highlights that invoice as higher priority

#### Scenario: User opens promise history from a badge

- **WHEN** a user clicks a promise badge (active, broken, or broken-history count) on an invoice row
- **THEN** the system opens a modal titled "Promise history" listing every `PromiseToPay` record for that invoice, ordered newest first, each showing status, promised pay-by date, promised amount (or "Full balance" when unset), and any client note

#### Scenario: Promise history modal is dismissible

- **WHEN** the promise history modal is open
- **THEN** the user can close it via a close button, the Escape key, or a backdrop click, without navigating away from the dashboard
