## MODIFIED Requirements

### Requirement: Arrangement lifecycle is visible in the dashboard
The system SHALL display arrangement state and risk cues in the dashboard for invoices
covered by an arrangement, and SHALL let a freelancer open a modal to view that
arrangement's full detail.

#### Scenario: Invoice is covered by active arrangement
- **WHEN** an invoice belongs to an active arrangement
- **THEN** the dashboard displays that the invoice is covered by an arrangement and shows the relevant repayment summary

#### Scenario: Invoice is covered by broken arrangement
- **WHEN** an invoice belongs to a broken arrangement
- **THEN** the dashboard displays the arrangement breach state as a follow-up priority signal

#### Scenario: Freelancer opens full arrangement detail
- **WHEN** a freelancer clicks the arrangement summary shown for a covered invoice
- **THEN** the dashboard opens a modal showing the arrangement's full detail, including
  every invoice covered by that arrangement, and the freelancer can close the modal to
  return to the invoice table
