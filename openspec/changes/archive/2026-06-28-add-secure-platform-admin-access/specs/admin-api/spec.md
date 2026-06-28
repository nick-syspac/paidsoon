## ADDED Requirements

### Requirement: All admin API endpoints require layered authentication
Every `/api/admin/*` endpoint SHALL independently verify: (1) valid Supabase auth session via `supabase.auth.getUser()`; (2) platform role exists for the user in the `PlatformRole` table; (3) valid, non-expired, non-revoked `AdminSession` row matching the `admin_session` cookie. If any layer fails, the endpoint SHALL return 401 or 403 immediately with no business data in the response.

#### Scenario: Unauthenticated request is rejected
- **WHEN** a request to `/api/admin/tenants` is made without a Supabase session
- **THEN** the endpoint returns 401

#### Scenario: Tenant user is rejected
- **WHEN** a request to `/api/admin/tenants` is made by an authenticated user with no platform role
- **THEN** the endpoint returns 403

#### Scenario: Admin without elevated session is rejected
- **WHEN** a `platform_admin` requests `/api/admin/tenants` without a valid `AdminSession`
- **THEN** the endpoint returns 401 with `reason = elevation_required`

#### Scenario: Elevated admin can access tenant list
- **WHEN** a `platform_admin` requests `/api/admin/tenants` with a valid elevated `AdminSession`
- **THEN** the endpoint returns a paginated list of tenants

---

### Requirement: Admin API endpoint inventory
The system SHALL expose the following admin API endpoints, each protected by the layered admin auth guard:

```
GET    /api/admin/me                              — current admin user + role + session info
POST   /api/admin/challenges                      — create admin challenge nonce
POST   /api/admin/challenges/{id}/verify          — verify signed challenge, creates AdminSession
POST   /api/admin/sessions/revoke                 — revoke current elevated session

GET    /api/admin/tenants                         — list all tenants (paginated)
GET    /api/admin/tenants/{id}                    — tenant detail
GET    /api/admin/users                           — list all users (paginated)
GET    /api/admin/subscriptions                   — list all subscriptions
GET    /api/admin/integrations                    — list all integrations
GET    /api/admin/email-jobs                      — list email follow-up jobs with failure state
GET    /api/admin/audit-events                    — list audit events (paginated, filterable)

GET    /api/admin/devices                         — list admin devices
POST   /api/admin/devices                         — enrol new admin device
POST   /api/admin/devices/{id}/revoke             — revoke admin device

GET    /api/admin/staff                           — list staff users and roles
POST   /api/admin/staff/invitations               — invite new staff member
POST   /api/admin/staff/{user_id}/role            — update staff platform role
POST   /api/admin/staff/{user_id}/disable         — disable staff account

POST   /api/admin/impersonation/start             — start view-as-tenant session
POST   /api/admin/impersonation/end               — end view-as-tenant session
```

`POST /api/admin/challenges` and `POST /api/admin/challenges/{id}/verify` require only layers (1) and (2) (no `AdminSession` needed, as they are the elevation flow).

#### Scenario: GET /api/admin/me returns safe admin context
- **WHEN** an elevated admin GETs `/api/admin/me`
- **THEN** the response includes user ID, email, platform role, session expiry, and device label; it does not include `sessionToken`, private key data, or raw credentials

---

### Requirement: Admin API responses never expose raw secrets
Admin API responses SHALL mask all sensitive values. Integration API keys SHALL show only the last 4 characters. Environment variable values, Stripe secret keys, and Resend API keys SHALL never appear in any admin API response.

#### Scenario: Integration API key is masked in response
- **WHEN** an admin GETs `/api/admin/integrations`
- **THEN** any `accessToken` or `apiKey` field is returned as `"****<last4>"`

---

### Requirement: Admin API uses prismaAdmin and never withUserContext for admin table operations
Admin route handlers that read or write `PlatformRole`, `AdminDevice`, `AdminChallenge`, `AdminSession`, `AdminAuditEvent`, or `StaffInvitation` tables SHALL use `prismaAdmin`. These tables are invisible to `withUserContext` because RLS denies access.

#### Scenario: Admin table read uses prismaAdmin
- **WHEN** any admin route handler queries the `AdminDevice` table
- **THEN** the query goes through `prismaAdmin`, not `withUserContext`

---

### Requirement: Admin API endpoints are not discoverable from public routes
Admin API route handlers SHALL not be referenced from any public Next.js page, public API route, or client-side component bundle. Admin route modules SHALL only be imported from other admin context files.

#### Scenario: Non-admin page does not reference admin routes
- **WHEN** the production JavaScript bundle for any non-admin page is analysed
- **THEN** no `/api/admin/*` path strings are present in the bundle
