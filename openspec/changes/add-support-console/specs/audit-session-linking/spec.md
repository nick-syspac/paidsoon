## ADDED Requirements

### Requirement: Audit events are linked to impersonation sessions

The system SHALL add an optional `adminSessionId` field to the `AdminAuditEvent` table. When an `AdminAuditEvent` is created during an active `AdminSession` (impersonation), the event SHALL automatically be linked via `adminSessionId`. Events created outside of impersonation (e.g., direct admin actions, customer searches) SHALL have `adminSessionId = NULL`.

#### Scenario: Audit events during impersonation are linked to session
- **WHEN** an `AdminSession` is active (impersonation in progress)
- **AND** a support staff member views customer data or the dashboard triggers telemetry
- **THEN** any `AdminAuditEvent` created inherits `adminSessionId` from the active session context
- **AND** the event can be queried via `/api/admin/audit-log?sessionId=<id>` to see all actions within that impersonation

#### Scenario: Audit events outside impersonation have no session link
- **WHEN** a `platform_admin` performs a direct action (e.g., edits schedule) WITHOUT an active impersonation
- **THEN** an `AdminAuditEvent` is created with `adminSessionId = NULL`
- **AND** the event is still queryable but not grouped under any session

#### Scenario: Querying all events for a customer in a date range
- **WHEN** support needs to audit "what happened to customer X in the last 7 days"
- **AND** they query `/api/admin/audit-log?targetUserId=<id>&startDate=<date>&endDate=<date>`
- **THEN** the system returns all events for that customer, grouped by session if present
- **AND** response shows: search events (no session), impersonation events (grouped by session ID with start/end times), direct action events (no session)

### Requirement: Session end captures total duration and action count

When an `AdminSession` ends (via `/api/admin/impersonation/end`), the system SHALL calculate and store: `duration` (endedAt - startedAt in seconds), `actionCount` (count of linked `AdminAuditEvent` rows). This summary is displayed in the staff activity feed and audit log.

#### Scenario: Session summary is captured on end
- **WHEN** an impersonation session ends after 12 minutes and 5 audit events were logged
- **THEN** the `AdminSession` record stores: `duration: 720` (seconds), `actionCount: 5`
- **AND** the staff activity feed displays: "Impersonated sarah@acme.com for 12 minutes (5 actions)"
