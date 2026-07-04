## ADDED Requirements

### Requirement: Client promise retry limits per debtor
The system SHALL enforce a configurable limit on client-originated promise-to-pay commitments for the same debtor within a freelancer account after broken promises occur.

#### Scenario: Client remains below retry limit
- **WHEN** a client submits a new promise for an invoice and the number of broken client-originated promises for that debtor is below the configured retry limit
- **THEN** the system accepts the new promise if all other validation rules pass

#### Scenario: Client reaches retry limit
- **WHEN** a client submits a new promise for an invoice and the debtor has reached or exceeded the configured retry limit for broken client-originated promises
- **THEN** the system rejects the submission and instructs the client to contact the freelancer directly

### Requirement: Broken-promise escalation policy
The system SHALL allow the freelancer to configure how repeated broken promises affect follow-up handling for that account.

#### Scenario: Freelancer uses default escalation policy
- **WHEN** a freelancer has not customised broken-promise escalation settings
- **THEN** the system applies default policy values that preserve existing reminder timing and tone behaviour

#### Scenario: Freelancer configures escalation thresholds
- **WHEN** a freelancer saves escalation settings for repeated broken promises
- **THEN** the system stores threshold-based policy values for dashboard priority and optional timing or tone escalation

### Requirement: Repeated broken promises raise debtor priority
The system SHALL treat repeated broken client-originated promises as a debtor-risk signal in the dashboard.

#### Scenario: Debtor has one or more broken promises
- **WHEN** the dashboard renders an overdue invoice for a debtor with broken client-originated promises
- **THEN** the system displays the broken-promise count as part of the invoice risk signal

#### Scenario: Debtor crosses escalation threshold
- **WHEN** a debtor's broken-promise count reaches a configured escalation threshold
- **THEN** the system marks the debtor or invoice as higher priority in the dashboard

### Requirement: Escalation policy can affect timing or tone
The system SHALL support policy-driven follow-up escalation after repeated broken promises by allowing the freelancer to opt into timing changes, tone changes, or both.

#### Scenario: Timing escalation enabled
- **WHEN** a debtor crosses a configured broken-promise threshold and timing escalation is enabled
- **THEN** the system applies the configured timing escalation to subsequent reminders for eligible invoices

#### Scenario: Tone escalation enabled
- **WHEN** a debtor crosses a configured broken-promise threshold and tone escalation is enabled
- **THEN** the system applies the configured tone escalation to subsequent reminders for eligible invoices