## ADDED Requirements

### Requirement: Platform role model exists independently of tenant roles
The system SHALL maintain platform-level roles (`platform_owner`, `platform_admin`, `platform_support`) in a dedicated `PlatformRole` table stored in Postgres and accessible only via the server-side Prisma admin client. Tenant-level roles SHALL NOT grant platform access. Platform roles SHALL NOT be visible to the Supabase anon or authenticated database clients.

#### Scenario: Tenant user cannot access platform role data
- **WHEN** a tenant user's Supabase session is used to query the `platform_roles` table
- **THEN** the query returns zero rows and raises no error (RLS deny policy)

#### Scenario: Platform owner has full admin access
- **WHEN** a user with `platform_owner` role passes all admin guards
- **THEN** they can access all `/admin/*` routes and `/api/admin/*` endpoints

#### Scenario: Platform support has limited access
- **WHEN** a user with `platform_support` role passes admin guards
- **THEN** they can access read-only support views but cannot modify subscriptions, billing state, or system settings

---

### Requirement: Owner bootstrap via seed script
The system SHALL provide a `scripts/seed-admin-owner.ts` script that creates the first `platform_owner` role. The script SHALL read `PLATFORM_OWNER_EMAIL` from the environment, find the matching Supabase auth user, and write a `PlatformRole` row using `prismaAdmin`. The script SHALL be idempotent. No HTTP endpoint SHALL allow creation of a `platform_owner` role.

#### Scenario: Seed script creates owner role
- **WHEN** `npm run seed:admin-owner` is run with `PLATFORM_OWNER_EMAIL` set to an existing Supabase user's email
- **THEN** a `PlatformRole` row with `role = platform_owner` is created for that user

#### Scenario: Seed script is idempotent
- **WHEN** `npm run seed:admin-owner` is run a second time for the same email
- **THEN** no duplicate row is created and the script exits successfully

#### Scenario: Seed script rejects unknown email
- **WHEN** `npm run seed:admin-owner` is run with an email that has no Supabase auth user
- **THEN** the script exits with a non-zero code and a clear error message

#### Scenario: Platform owner cannot be created via HTTP
- **WHEN** a POST request is sent to any public or admin API endpoint attempting to assign `platform_owner` role
- **THEN** the request is rejected with 403

---

### Requirement: Staff invitation and role assignment
The system SHALL allow a `platform_owner` or `platform_admin` to invite a named staff member by email and assign them a platform role (`platform_admin` or `platform_support`). The invitation SHALL be stored in a `StaffInvitation` table. The invited user SHALL register their own admin device before gaining admin access. No platform role SHALL be self-assigned by the invitee.

#### Scenario: Owner creates staff invitation
- **WHEN** a `platform_owner` POSTs to `/api/admin/staff/invitations` with a valid email and role
- **THEN** a `StaffInvitation` row is created and an invitation email is sent to the target address

#### Scenario: Invited staff accepts invitation
- **WHEN** the invitee uses the invitation token link and their own Supabase account
- **THEN** a `PlatformRole` row is created for them with the assigned role

#### Scenario: Uninvited user cannot become staff
- **WHEN** a user without a `StaffInvitation` attempts to assign themselves a platform role
- **THEN** the request is rejected with 403

#### Scenario: Role assignment is audited
- **WHEN** a platform role is assigned via invitation acceptance
- **THEN** an `AdminAuditEvent` row is created with `action = role_assigned`

---

### Requirement: Platform role cannot be assigned by tenant admins
The system SHALL reject any attempt by a `tenant_owner` or `tenant_admin` to assign or modify platform roles.

#### Scenario: Tenant admin cannot escalate to platform admin
- **WHEN** a `tenant_admin` POSTs to `/api/admin/staff/{user_id}/role`
- **THEN** the request is rejected with 403

---

### Requirement: Staff access is revocable
A `platform_owner` or `platform_admin` SHALL be able to disable a staff account and revoke all their admin devices. Revocation SHALL immediately invalidate all active `AdminSession` rows for the affected user.

#### Scenario: Staff account is disabled
- **WHEN** a `platform_owner` POSTs to `/api/admin/staff/{user_id}/disable`
- **THEN** the staff user's `PlatformRole.status` is set to `disabled` and all their `AdminSession` rows are deleted

#### Scenario: Disabled staff cannot access admin
- **WHEN** a disabled staff user attempts to access any `/api/admin/*` endpoint
- **THEN** the request is rejected with 403
