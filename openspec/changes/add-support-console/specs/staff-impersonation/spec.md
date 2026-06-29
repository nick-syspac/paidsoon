## ADDED Requirements

### Requirement: Support staff can impersonate a customer (read-only redirect)

The system SHALL provide a `/api/admin/impersonation/start` endpoint that accepts a `userId` and optional `notifyCustomer` flag. The endpoint SHALL create an `AdminSession` record with `impersonatedUserId` set to the target customer. The response SHALL include a redirect URL to the customer's `/dashboard` with a special query parameter indicating read-only mode. The endpoint SHALL require `platform_admin` or `platform_support` role. An `AdminAuditEvent` SHALL be created with action type `impersonate_start`, target userId, and optional notification flag stored in details.

#### Scenario: Successful impersonation redirect
- **WHEN** a `platform_support` user clicks [Impersonate] on a customer profile
- **THEN** the system POSTs to `/api/admin/impersonation/start` with `userId` and optional `notifyCustomer`
- **AND** the response includes a redirect URL to `/dashboard?impersonating=true&session=<sessionId>`
- **AND** an `AdminSession` is created with `impersonatedUserId` = target customer's ID
- **AND** an `AdminAuditEvent` is logged with action `impersonate_start`

#### Scenario: Customer dashboard is rendered in read-only mode during impersonation
- **WHEN** support staff is redirected to the customer's `/dashboard?impersonating=true`
- **THEN** the system displays a prominent banner: "Support Mode: Read-only view. All actions are monitored and logged."
- **AND** all action buttons (pause, resume, trigger email, edit schedule, etc.) are disabled or hidden
- **AND** clicking a disabled button shows a tooltip: "This action is read-only during support troubleshooting"
- **AND** a [End Impersonation] button is displayed to return to admin console

#### Scenario: Impersonation session ends when support staff returns to admin
- **WHEN** support staff clicks [End Impersonation] on the dashboard
- **THEN** the system PUTs to `/api/admin/impersonation/end` with `sessionId`
- **AND** the `AdminSession` is closed with `endedAt` timestamp
- **AND** an `AdminAuditEvent` is logged with action `impersonate_end`
- **AND** support staff is redirected back to `/admin/customers/[userId]` (customer profile in admin)

#### Scenario: Optional customer notification after impersonation ends
- **WHEN** an `AdminSession` ends with `notifyCustomer = true`
- **THEN** the system sends a transactional email to the customer's registered email address
- **AND** the email contains: "Our support team accessed your account on [date/time] for troubleshooting. [Support contact info]"
- **AND** the email is tagged in `AdminAuditEvent` details (`notification_sent` = true)
- **AND** if notification send fails, it is logged but does not fail the impersonation end

#### Scenario: Impersonation session expires after 1 hour of inactivity
- **WHEN** an `AdminSession` remains open without interaction for 60 minutes
- **THEN** the session is automatically closed by the dashboard UI
- **AND** an `AdminAuditEvent` is logged with action `impersonate_timeout`
- **AND** the support staff is redirected to admin console with a message: "Session expired due to inactivity"

#### Scenario: Impersonation is not visible to the customer
- **WHEN** a support staff member is impersonating a customer
- **AND** the customer attempts to log in to their own account
- **THEN** the system allows the customer to log in (they see their normal dashboard)
- **AND** the support staff member's session is terminated automatically
- **AND** an `AdminAuditEvent` is logged with action `impersonate_conflict` (customer logged in during support session)

### Requirement: All impersonation sessions are logged with duration and actions taken

The system SHALL link all `AdminAuditEvent` rows created during an impersonation to the parent `AdminSession` via `adminSessionId`. The `AdminSession` record SHALL store: `adminUserId`, `impersonatedUserId`, `startedAt`, `endedAt`, `status` (active/ended/expired/conflict).

#### Scenario: Audit trail shows coherent impersonation workflow
- **WHEN** support staff impersonates a customer, views two pages, then exits
- **THEN** querying `/api/admin/audit-log?sessionId=<id>` returns:
  - Event 1: `impersonate_start` (session opened, customer: sarah@acme.com)
  - Event 2: `view_dashboard` (what page was viewed; from dashboard telemetry)
  - Event 3: `view_settings` (another page viewed)
  - Event 4: `impersonate_end` (session closed, duration: 12 minutes)
- **AND** all 4 events have `adminSessionId` matching the session ID
