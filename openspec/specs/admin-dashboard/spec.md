# admin-dashboard Specification

## Purpose
TBD - created by archiving change add-secure-platform-admin-access. Update Purpose after archive.
## Requirements
### Requirement: Admin dashboard is accessible only to elevated platform admins
The system SHALL serve a protected admin UI at `/admin` and its sub-paths. Any request to `/admin/*` without a valid Supabase session, a platform role, and an active elevated `AdminSession` SHALL be redirected to `/admin/login` or `/dashboard` as appropriate. The admin area SHALL never be linked from public-facing UI.

#### Scenario: Unauthenticated user is redirected
- **WHEN** an unauthenticated user navigates to `/admin`
- **THEN** they are redirected to `/sign-in`

#### Scenario: Authenticated tenant user is blocked
- **WHEN** an authenticated user with no platform role navigates to `/admin`
- **THEN** they are redirected to `/dashboard` with no admin content rendered

#### Scenario: Admin without elevated session sees elevation prompt
- **WHEN** a `platform_admin` navigates to `/admin` without an active `AdminSession`
- **THEN** they are shown an admin elevation challenge page, not the admin dashboard content

#### Scenario: Elevated admin sees dashboard
- **WHEN** a `platform_admin` has a valid elevated `AdminSession` and navigates to `/admin`
- **THEN** the admin dashboard overview page is rendered

---

### Requirement: Admin dashboard sections are role-scoped
The admin dashboard SHALL expose the following sections. `platform_support` users SHALL have read-only access; `platform_admin` and `platform_owner` have full access unless noted.

| Route | Description | Access |
|-------|-------------|--------|
| `/admin/overview` | System health summary | All platform roles |
| `/admin/tenants` | List all tenants | All platform roles |
| `/admin/users` | List all users | All platform roles |
| `/admin/subscriptions` | Billing and subscription state | All platform roles |
| `/admin/integrations` | Integration connection health | All platform roles |
| `/admin/email-jobs` | Email follow-up queue state and failures | All platform roles |
| `/admin/audit` | Platform audit event log | All platform roles |
| `/admin/support` | Support debug tools | All platform roles |
| `/admin/settings` | Platform settings | `platform_owner` only |
| `/admin/admin-devices` | Manage admin devices | `platform_owner`, `platform_admin` |
| `/admin/staff` | Manage staff accounts and roles | `platform_owner` only |

#### Scenario: Support role cannot access settings
- **WHEN** a `platform_support` user navigates to `/admin/settings`
- **THEN** they receive a 403 response

#### Scenario: Admin device management is visible to owner and admin
- **WHEN** a `platform_admin` navigates to `/admin/admin-devices`
- **THEN** the device registry is rendered

---

### Requirement: Admin UI shows persistent elevation status indicator
The admin dashboard layout SHALL display the current elevated session status (time remaining, acting user, device label) in every admin page. When the elevated session expires, the UI SHALL prompt for re-elevation without losing navigation context.

#### Scenario: Elevation expiry prompt appears
- **WHEN** the elevated `AdminSession` expires while the admin is on the dashboard
- **THEN** an overlay/modal prompts the admin to re-verify their device key before continuing

#### Scenario: Session remaining time is displayed
- **WHEN** an admin is on any admin dashboard page
- **THEN** a persistent indicator shows the approximate time remaining on the elevated session

---

### Requirement: Admin dashboard never renders raw secrets or payment card data
The admin UI SHALL display tenant data (subscriptions, integrations) in a safe format. Payment card numbers, CVVs, plaintext secrets, and API keys SHALL never be rendered in the browser.

#### Scenario: Integration credentials are masked
- **WHEN** an admin views a tenant's integration details
- **THEN** API keys and secrets are displayed as `****` with only the last 4 characters visible

#### Scenario: Stripe card data is not displayed
- **WHEN** an admin views a tenant's subscription
- **THEN** no raw card numbers or CVVs are shown; only the Stripe-provided masked card summary is displayed

