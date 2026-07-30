## MODIFIED Requirements

### Requirement: Audit events capture full actor, device, and target context

Every `AdminAuditEvent` row SHALL include all existing fields AND additionally:
- `adminSessionId` (UUID, nullable) — link to `AdminSession` if event occurred during impersonation
- `targetUserId` (string, nullable) — customer user ID being acted upon (distinct from `targetId` which may be a resource)
- `resourceId` (string, nullable) — specific resource being modified (e.g., invoiceId, scheduleId)
- `details` (JSON, nullable) — context-specific data (e.g., old/new values for schedule change, count of invoices paused)
- `reason` (string, nullable) — support staff explanation for the action (required for admin actions, optional for searches/views)

#### Scenario: Support action captures full context including reason and changes
- **WHEN** support staff updates a customer's schedule via `/api/admin/customers/[userId]/actions/edit-schedule` with reason
- **THEN** the resulting `AdminAuditEvent` row has:
  - `adminSessionId`: NULL (not during impersonation)
  - `targetUserId`: the customer's userId
  - `action`: `update_schedule`
  - `reason`: the provided reason text
  - `resourceId`: the Schedule ID
  - `details`: `{old: [3, 10, 21], new: [5, 12, 25]}`
  - All other fields (actorUserId, ipAddress, userAgent, etc.) from existing requirement

#### Scenario: Customer search creates audit event without session or target
- **WHEN** support staff searches for customers via `/api/admin/customers/search?q=email`
- **THEN** the resulting `AdminAuditEvent` row has:
  - `adminSessionId`: NULL
  - `targetUserId`: NULL (search is not targeted at a specific customer)
  - `action`: `customer_search`
  - `reason`: NULL (searches don't require a reason)
  - `details`: `{query: "email", results_count: 3}`
  - Other fields (actorUserId, ipAddress, userAgent, requestId) captured per existing requirement

#### Scenario: Impersonation session links all contained events
- **WHEN** an `AdminSession` is created for impersonation
- **THEN** an `AdminAuditEvent` with `action: impersonate_start` is created with:
  - `adminSessionId`: the newly created session ID
  - `targetUserId`: the customer being impersonated
  - `reason`: NULL (impersonations are context-free, reason is in the action)
  - `details`: `{notifyCustomer: true/false}`
  - AND subsequent events during this session inherit `adminSessionId` from the context

### Requirement: Audit event action enum includes support-console-specific actions

The `action` enum SHALL be expanded to include:
```
customer_search
impersonate_start
impersonate_end
impersonate_timeout
impersonate_conflict
update_schedule
pause_invoices
resume_invoices
trigger_email
mark_invoice_paid
```

These are in addition to the existing enum values from the parent spec.

#### Scenario: Support actions use new action types
- **WHEN** support staff performs any support-console action
- **THEN** the action type is one of the new support-specific enum values
- **AND** Prisma validation rejects any non-enum action value

### Requirement: Reason field is required for admin actions, optional for searches and views

Admin modification actions (update_schedule, pause_invoices, resume_invoices, trigger_email, mark_invoice_paid) SHALL require a non-empty `reason` field (minimum 10 characters). Search and view actions do not require a reason. The API SHALL validate this at request time.

#### Scenario: Admin action without reason is rejected
- **WHEN** a `platform_admin` POSTs to `/api/admin/customers/[userId]/actions/update-schedule` without a `reason` field
- **THEN** the API returns 400 Bad Request with error: "reason field is required"
- **AND** no `AdminAuditEvent` is created

#### Scenario: Search action without reason is accepted
- **WHEN** a `platform_support` user GETs `/api/admin/customers/search?q=email`
- **THEN** the API accepts the request (no reason required)
- **AND** the resulting `AdminAuditEvent` has `reason: NULL`

### Requirement: AdminSession is linked to audit events for session-scoped context

The `AdminSession` model SHALL be updated to include:
- `adminUserId` (string) — the staff member
- `impersonatedUserId` (string) — the customer being impersonated
- `startedAt` (timestamp) — when session started
- `endedAt` (timestamp, nullable) — when session ended
- `status` (enum: active, ended, expired, conflict) — session state

When an `AdminSession` is created, an `AdminAuditEvent` with `action: impersonate_start` is inserted. When the session ends (via `/api/admin/impersonation/end` or timeout), an `AdminAuditEvent` with `action: impersonate_end` is inserted, and `endedAt` is set.

#### Scenario: Querying audit log by session ID shows coherent workflow
- **WHEN** support queries `/api/admin/audit-log?sessionId=session-123`
- **THEN** the response returns all `AdminAuditEvent` rows with `adminSessionId = session-123`
- **AND** includes the parent `AdminSession` context: adminUserId, impersonatedUserId, startedAt, endedAt, status
- **AND** the response shows a coherent timeline of events within that session

#### Scenario: Querying by customer shows all sessions and actions
- **WHEN** support queries `/api/admin/audit-log?targetUserId=user-xyz&startDate=2026-06-01`
- **THEN** the response groups events by session (if linked) and non-session events
- **AND** for each session, shows: adminUserId, startedAt, endedAt, duration, actionCount
- **AND** for each action event, shows: action, reason, targetUserId, resourceId, details, timestamp

