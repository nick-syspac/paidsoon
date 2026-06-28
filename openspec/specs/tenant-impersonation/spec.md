# tenant-impersonation Specification

## Purpose
TBD - created by archiving change add-secure-platform-admin-access. Update Purpose after archive.
## Requirements
### Requirement: Tenant impersonation is an explicit, audited action
A `platform_owner` or `platform_admin` SHALL be able to start a "view as tenant" session by POSTing to `/api/admin/impersonation/start` with a `tenantId`. The `AdminSession` row SHALL be updated with `impersonatedTenantId`. The impersonation context SHALL be visible in every admin UI page while active. Impersonation SHALL only be available during an active elevated `AdminSession`.

#### Scenario: Admin starts impersonation
- **WHEN** a `platform_admin` with an active elevated session POSTs to `/api/admin/impersonation/start` with a valid `tenantId`
- **THEN** the `AdminSession.impersonatedTenantId` is set and an `AdminAuditEvent` with `action = impersonation_started` is created

#### Scenario: Admin ends impersonation
- **WHEN** a `platform_admin` POSTs to `/api/admin/impersonation/end`
- **THEN** `AdminSession.impersonatedTenantId` is cleared and an `AdminAuditEvent` with `action = impersonation_ended` is created

#### Scenario: Admin UI shows impersonation banner
- **WHEN** `AdminSession.impersonatedTenantId` is set
- **THEN** every admin page renders a persistent banner identifying the tenant being viewed

---

### Requirement: Impersonation is read-only by default; destructive actions require confirmation
During an active impersonation session, DELETE operations and irreversible mutations on tenant data SHALL require an additional explicit confirmation step. The confirmation SHALL be recorded in the audit trail.

#### Scenario: Destructive action during impersonation requires confirmation
- **WHEN** an admin attempts a DELETE or irreversible mutation while impersonating a tenant
- **THEN** the UI presents a confirmation dialog and the API requires a `confirm: true` body field

#### Scenario: Confirmed destructive action is audited
- **WHEN** an admin confirms a destructive action during impersonation
- **THEN** an `AdminAuditEvent` is created with `action = impersonation_destructive_action` and the full action detail

---

### Requirement: Impersonation does not expose tenant secrets or credentials
While impersonating a tenant, the admin SHALL see tenant data in the same masked format as normal admin views. Integration API keys, Stripe secret keys, and other credentials SHALL remain masked.

#### Scenario: Impersonation view masks credentials
- **WHEN** an admin is viewing a tenant under impersonation
- **THEN** no plaintext secrets, API keys, or private credentials are returned from any API call

---

### Requirement: Impersonation session is automatically ended on admin session expiry or revocation
When an elevated `AdminSession` expires or is revoked, any active impersonation context within that session SHALL be terminated. An audit event SHALL be written for the implicit impersonation end.

#### Scenario: Session expiry ends impersonation
- **WHEN** an `AdminSession` with an active `impersonatedTenantId` expires
- **THEN** an `AdminAuditEvent` with `action = impersonation_ended` and `reason = session_expired` is created

---

### Requirement: Impersonation requires active elevated session
The impersonation start endpoint SHALL reject requests that do not have a valid `AdminSession`. Impersonation SHALL not be initiatable from the Supabase session alone.

#### Scenario: Impersonation without elevated session is rejected
- **WHEN** a `platform_admin` without a valid `AdminSession` POSTs to `/api/admin/impersonation/start`
- **THEN** the request is rejected with 401 and `reason = elevation_required`

---

### Requirement: Impersonation events appear in the audit log
Every impersonation lifecycle event (start, end, destructive action, implicit end) SHALL create an `AdminAuditEvent` row with `actor_user_id`, `platform_role`, `admin_device_id`, `tenant_id`, `action`, `ip_address`, `user_agent`, `timestamp`, and `success`.

#### Scenario: Audit log contains impersonation start
- **WHEN** the admin audit log is queried with `action = impersonation_started`
- **THEN** the matching event rows are returned with full actor and tenant context

