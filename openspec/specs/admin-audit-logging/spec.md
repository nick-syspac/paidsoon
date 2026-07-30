# admin-audit-logging Specification

## Purpose
TBD - created by archiving change add-secure-platform-admin-access. Update Purpose after archive.
## Requirements
### Requirement: AdminAuditEvent table is append-only and immutable
The system SHALL maintain an `AdminAuditEvent` table in Postgres. Rows SHALL be inserted only; no UPDATE or DELETE operations SHALL be permitted by application code. The table SHALL have an RLS policy denying all UPDATE and DELETE to all Postgres roles. `created_at` SHALL default to `now()` and SHALL NOT be settable by the inserting client.

#### Scenario: Audit event cannot be deleted by application code
- **WHEN** any application code path attempts to delete an `AdminAuditEvent` row
- **THEN** no delete path exists in the Prisma schema helpers and the RLS policy blocks the operation at the database level

#### Scenario: Audit event `created_at` cannot be backdated
- **WHEN** an `AdminAuditEvent` is inserted with a `created_at` value in the past
- **THEN** the database uses `now()` instead (column default) or a constraint rejects the explicit past value

---

### Requirement: Audit events capture full actor, device, and target context
Every `AdminAuditEvent` row SHALL include:
- `actorUserId` (UUID)
- `actorEmail` (string)
- `platformRole` (enum)
- `adminDeviceId` (UUID, nullable)
- `adminDeviceFingerprint` (string, nullable)
- `action` (enum, see list below)
- `targetType` (string, nullable)
- `targetId` (string, nullable)
- `tenantId` (string, nullable)
- `ipAddress` (string)
- `userAgent` (string)
- `requestId` (string)
- `success` (boolean)
- `reason` (string, nullable)
- `createdAt` (timestamp, server-set)

#### Scenario: Full context is captured on admin session start
- **WHEN** an `AdminSession` is created
- **THEN** the resulting `AdminAuditEvent` row has non-null values for `actorUserId`, `actorEmail`, `platformRole`, `adminDeviceId`, `adminDeviceFingerprint`, `ipAddress`, `userAgent`, and `requestId`

---

### Requirement: Audit event action enum covers all admin lifecycle events
The `action` field SHALL use an enum with at minimum the following values:
```
admin_challenge_created
admin_challenge_verified
admin_challenge_failed
admin_session_started
admin_session_expired
admin_session_revoked
device_enrolled
device_revoked
staff_invited
role_assigned
role_changed
staff_disabled
tenant_viewed
impersonation_started
impersonation_ended
impersonation_destructive_action
subscription_changed
integration_action
email_job_retried
email_job_paused
email_job_resumed
system_setting_changed
```

#### Scenario: Unknown action is rejected
- **WHEN** application code attempts to insert an `AdminAuditEvent` with an `action` value not in the enum
- **THEN** the insert is rejected at the type level by Prisma's generated types

---

### Requirement: Audit log is queryable by platform owner and admin
The `/api/admin/audit-events` endpoint SHALL return paginated `AdminAuditEvent` rows. The endpoint SHALL support filtering by `actorUserId`, `action`, `tenantId`, `success`, and date range. The response SHALL include all audit event fields except internal IDs that could expose infrastructure. The endpoint SHALL not be accessible to `platform_support` users without explicit role grant.

#### Scenario: Owner can query audit events with filters
- **WHEN** a `platform_owner` GETs `/api/admin/audit-events?action=admin_session_started&from=2026-01-01`
- **THEN** the response returns paginated matching `AdminAuditEvent` rows

#### Scenario: Pagination is enforced
- **WHEN** the audit log contains more events than the page size (default 100)
- **THEN** the response includes a cursor or page token for the next page

---

### Requirement: Every admin API request creates an audit event on failure
When an admin API request fails due to an auth guard rejection (401/403), an `AdminAuditEvent` row SHALL be created with `success = false` and the failure reason, capturing the attempted action, actor identity (if resolvable), IP, and user agent.

#### Scenario: Failed admin API call creates audit event
- **WHEN** a user with no platform role attempts to access `/api/admin/tenants` and receives 403
- **THEN** an `AdminAuditEvent` with `action = tenant_viewed`, `success = false`, and `reason = no_platform_role` is created

#### Scenario: Failed challenge verification creates audit event
- **WHEN** an invalid signature is submitted to `/api/admin/challenges/{id}/verify`
- **THEN** an `AdminAuditEvent` with `action = admin_challenge_failed`, `success = false`, and `reason = invalid_signature` is created

