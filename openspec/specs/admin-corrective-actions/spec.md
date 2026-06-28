# admin-corrective-actions Specification

## Purpose
TBD - created by archiving change admin-support-diagnostics. Update Purpose after archive.
## Requirements
### Requirement: Reset email From address action
The system SHALL provide a `reset-email-from` corrective action accessible from the tenant detail view. When triggered, the action SHALL set `EmailSettings.fromEmail`, `EmailSettings.fromName`, and `EmailSettings.replyTo` to null for the target tenant. The action SHALL log an `AdminAuditEvent` with `action = "admin_tenant_action"`, `tenantId` set, and `metadata` containing the previous `fromEmail` value so it can be manually restored if needed.

The action SHALL only be available when the `custom-from-unverified` diagnostic is present. The endpoint SHALL require full admin elevation (all three guard layers).

#### Scenario: Admin resets custom From address
- **WHEN** an admin clicks "Reset to system From" on a tenant with the `custom-from-unverified` diagnostic and confirms the action
- **THEN** `EmailSettings.fromEmail`, `fromName`, and `replyTo` are set to null, an audit event is written with the old `fromEmail` in metadata, and the tenant detail page refreshes showing no `custom-from-unverified` diagnostic

#### Scenario: Action requires confirmation before executing
- **WHEN** an admin clicks "Reset to system From"
- **THEN** a confirmation dialog is shown describing the effect before the action is submitted

#### Scenario: Action is rejected without admin elevation
- **WHEN** a request is made to the reset-email-from endpoint without a valid `AdminSession` cookie
- **THEN** the endpoint returns 401

---

### Requirement: Extend trial action
The system SHALL provide an `extend-trial` corrective action accessible from the tenant detail view. When triggered with a number of days (1–30), the action SHALL set `UserProfile.trialEndsAt` to `now() + N days`. The action SHALL only be available when the `trial-lapsed` diagnostic is present AND the tenant's `subscriptionStatus` is `"trialing"`. The action SHALL write an `AdminAuditEvent` with the previous and new `trialEndsAt` values in metadata.

#### Scenario: Admin extends a lapsed trial by 7 days
- **WHEN** an admin selects 7 days and confirms the extend-trial action for a tenant with `trial-lapsed` diagnostic
- **THEN** `UserProfile.trialEndsAt` is updated to 7 days from now, an audit event is written, and the `trial-lapsed` diagnostic no longer appears on the tenant detail page

#### Scenario: Extension day count is validated
- **WHEN** the extend-trial endpoint receives a `days` value outside 1–30
- **THEN** the endpoint returns 400 with a validation error

#### Scenario: Action is rejected for non-trialing tenants
- **WHEN** the extend-trial endpoint is called for a tenant whose `subscriptionStatus` is not `"trialing"`
- **THEN** the endpoint returns 409 with an error message

---

### Requirement: Trigger accounting resync action
The system SHALL provide a `trigger-resync` corrective action for each `AccountingConnection` with a `sync-stale` diagnostic. When triggered, the action SHALL initiate a sync for that connection using the same logic as the scheduled sync (Xero or MYOB provider). The action SHALL write an `AdminAuditEvent` with the connection ID and provider in metadata.

#### Scenario: Admin triggers resync for a stale connection
- **WHEN** an admin clicks "Trigger resync" for an accounting connection with a `sync-stale` diagnostic and confirms
- **THEN** a sync is initiated for that connection, an audit event is written, and the tenant detail page refreshes

#### Scenario: Action is rejected without admin elevation
- **WHEN** a request is made to the trigger-resync endpoint without a valid `AdminSession` cookie
- **THEN** the endpoint returns 401

---

### Requirement: Every corrective action is audit logged
Every corrective action endpoint SHALL write an `AdminAuditEvent` row before returning a success response. The event SHALL include: `actorUserId`, `actorEmail`, `platformRole`, `adminDeviceId`, `action = "admin_tenant_action"`, `tenantId` (the target user's ID), `ipAddress`, `userAgent`, `requestId`, `success`, and a `metadata` object with action-specific context. No action SHALL return 200 without having first written the audit event.

#### Scenario: Audit event written on success
- **WHEN** an admin successfully executes a corrective action
- **THEN** an `AdminAuditEvent` row exists with `success = true`, the correct `tenantId`, and action-specific metadata

#### Scenario: Audit event written on failure
- **WHEN** a corrective action fails (e.g. DB error after validation)
- **THEN** an `AdminAuditEvent` row exists with `success = false` and a `reason` field describing the failure

