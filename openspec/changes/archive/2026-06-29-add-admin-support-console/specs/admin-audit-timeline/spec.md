## ADDED Requirements

### Requirement: Support timeline includes operational events
Each tenant MUST have a support timeline showing user logins, invites sent, accounting connections, sync runs, invoice imports, reminders generated, reminders sent, email bounces, billing changes, admin actions, feature flag changes, setting changes, and errors.

#### Scenario: Timeline combines multiple event sources
- **WHEN** an admin opens tenant support history
- **THEN** the timeline includes records from the supported operational sources

### Requirement: Admin audit logs are immutable and append-only
Every admin action MUST create an immutable audit event containing admin user ID, tenant ID, target resource, action performed, before value where relevant, after value where relevant, reason, timestamp, request ID or correlation ID, and source IP or device where available. Admin audit logs MUST NOT be editable through the admin UI.

#### Scenario: Audit event contains required fields
- **WHEN** an admin action is performed
- **THEN** the resulting audit record includes the required actor and target context

#### Scenario: Audit log cannot be edited in UI
- **WHEN** an admin opens the audit log
- **THEN** there is no UI for editing or deleting audit records
