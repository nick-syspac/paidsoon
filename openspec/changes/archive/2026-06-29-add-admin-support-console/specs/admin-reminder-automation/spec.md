## ADDED Requirements

### Requirement: Reminder automation state is visible
The system MUST allow admins to inspect active reminder rules, reminder tone, reminder cadence, queued reminders, sent reminders, failed reminders, paused invoices or customers, suppressed recipients, and the next scheduled reminder run.

#### Scenario: Automation state is visible
- **WHEN** an admin opens the reminder automation view
- **THEN** the current rules, queue, and failure states are visible

### Requirement: Reminder automation actions are controlled
Admins SHOULD be able to pause reminders for a tenant, pause reminders for a customer, pause reminders for an invoice, resume reminders, retry failed reminders, cancel a scheduled reminder, regenerate a reminder schedule, preview reminder output, and manually trigger the reminder scheduler for a tenant.

#### Scenario: Tenant pause stops reminders
- **WHEN** an admin pauses reminders for a tenant
- **THEN** the tenant’s reminder automation is suspended

#### Scenario: Manual trigger is auditable
- **WHEN** an admin manually triggers the scheduler for a tenant
- **THEN** the event is logged with tenant and actor context
