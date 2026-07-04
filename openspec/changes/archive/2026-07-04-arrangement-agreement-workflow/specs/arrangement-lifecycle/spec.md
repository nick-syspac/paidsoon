## ADDED Requirements

### Requirement: Active arrangements suppress reminders for covered invoices
The system SHALL suppress scheduled reminder emails for any invoice covered by an active arrangement agreement.

#### Scenario: Covered invoice reaches next scheduled reminder
- **WHEN** the daily reminder cron evaluates an invoice covered by an active arrangement
- **THEN** the cron does not send a follow-up email for that invoice

#### Scenario: Uncovered invoice remains eligible
- **WHEN** the daily reminder cron evaluates an invoice that is not covered by an active arrangement
- **THEN** arrangement logic does not suppress that invoice's reminder eligibility

### Requirement: Arrangement breach or expiry resumes reminders automatically
The system SHALL resume reminder eligibility automatically for covered invoices when the arrangement is breached or expires without settlement.

#### Scenario: Arrangement becomes broken
- **WHEN** the system marks an arrangement as broken
- **THEN** covered invoices become eligible for subsequent scheduled reminders without resetting their existing reminder stage

#### Scenario: Arrangement expires without settlement
- **WHEN** an arrangement reaches its expiry condition without being fulfilled
- **THEN** covered invoices resume normal reminder eligibility automatically

### Requirement: Arrangement lifecycle is visible in the dashboard
The system SHALL display arrangement state and risk cues in the dashboard for invoices covered by an arrangement.

#### Scenario: Invoice is covered by active arrangement
- **WHEN** an invoice belongs to an active arrangement
- **THEN** the dashboard displays that the invoice is covered by an arrangement and shows the relevant repayment summary

#### Scenario: Invoice is covered by broken arrangement
- **WHEN** an invoice belongs to a broken arrangement
- **THEN** the dashboard displays the arrangement breach state as a follow-up priority signal

### Requirement: Arrangement fulfilment resolves arrangement state
The system SHALL update arrangement status when its repayment obligations are fulfilled.

#### Scenario: Full-payment arrangement is satisfied
- **WHEN** the covered balance for a full-payment arrangement is fully settled
- **THEN** the system marks the arrangement as fulfilled

#### Scenario: Instalment-plan arrangement completes all milestones
- **WHEN** all instalment obligations in an arrangement are satisfied
- **THEN** the system marks the arrangement as fulfilled