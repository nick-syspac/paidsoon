## Purpose

Define idempotent reminder scheduling and delivery behavior for unpaid DepositGuard requests using existing background-job and email-delivery infrastructure.

## ADDED Requirements

### Requirement: Deposit reminders SHALL be scheduled from deterministic rules
The system SHALL derive reminder schedules from tenant settings and request due dates, including initial, pre-due, due-day, and overdue reminders where enabled.

#### Scenario: Request is created with reminders enabled
- **WHEN** a deposit request is created for a tenant with automatic reminders enabled
- **THEN** the system schedules reminder entries according to tenant reminder policy

#### Scenario: Tenant disables reminders
- **WHEN** reminder automation is disabled in tenant settings
- **THEN** no new automated reminder sends are scheduled for that tenant

### Requirement: Reminder sending SHALL be idempotent and payment-aware
The system SHALL avoid duplicate reminder sends for the same request schedule point and SHALL stop further reminders once a request is paid or cancelled.

#### Scenario: Worker retries a due reminder send
- **WHEN** the same due reminder job is retried
- **THEN** at most one reminder email is sent for that schedule point

#### Scenario: Request is paid before next reminder
- **WHEN** a request transitions to paid before a scheduled reminder dispatch
- **THEN** pending reminders for that request are skipped or cancelled

### Requirement: Reminder attempts SHALL be auditable and retry-safe
The system SHALL record each reminder attempt with delivery outcome so failed sends can be retried without duplicating successful sends.

#### Scenario: Reminder send fails
- **WHEN** email delivery for a reminder fails
- **THEN** the failure reason and attempt timestamp are recorded
- **AND** the reminder remains eligible for safe retry according to retry policy
