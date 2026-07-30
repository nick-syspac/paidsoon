## Why

PaidSoon currently has no internal platform administration capability. The founder and any approved staff have no secure, auditable way to inspect tenant accounts, resolve billing issues, investigate email job failures, or manage the platform — without directly querying the database. This creates an operational blind spot and security risk, particularly as the platform scales beyond a single trusted user.

## What Changes

- Introduce platform-level roles (`platform_owner`, `platform_admin`, `platform_support`) separate from tenant roles, stored in a new `PlatformRole` model.
- Add an owner bootstrap mechanism: the first platform owner is seeded by a controlled environment variable or one-time admin seed script.
- Add an SSH-key-based challenge-response device verification system. The server stores only approved SSH public keys/fingerprints. The private key never leaves the trusted machine.
- Add an elevated `AdminSession` model that is short-lived (15–30 min) and separate from the normal Supabase auth session. Admin APIs are not accessible without a valid elevated session.
- Add an `AdminDevice` registry to track approved admin machines per staff user, with support for revocation.
- Add an `AdminChallenge` model for one-time, time-limited, namespace-scoped SSH challenge nonces.
- Add a `StaffInvitation` model so the platform owner can invite named staff with specific roles.
- Add an `AdminAuditEvent` model that captures every platform admin action immutably.
- Add a protected `/admin` dashboard area with sections for tenants, users, subscriptions, integrations, email jobs, audit logs, device management, and staff management.
- Add all `/api/admin/*` API routes, each requiring authenticated user + valid platform role + active elevated admin session.
- Add tenant impersonation / "view as tenant" mode with mandatory audit trails and blocked destructive actions.
- Add RLS policies so admin tables are never accessible to tenant-level Supabase clients.
- Add environment configuration variables to control admin feature flags, session TTLs, and challenge parameters.

No shared admin accounts. No browser storage of private SSH keys. No bypass of audit trails.

## Capabilities

### New Capabilities

- `platform-admin-roles`: Platform-level role model (`platform_owner`, `platform_admin`, `platform_support`) with owner bootstrap, staff invitation, and role assignment. Separate from tenant roles. Only platform admins may assign platform roles.
- `admin-device-registry`: SSH key/fingerprint registry for trusted admin devices per staff user. Supports enrolment, active/revoked/expired states, and immediate revocation. Private key is never stored.
- `admin-challenge-verification`: SSH Ed25519 challenge-response flow. Server issues a one-time nonce; the trusted machine signs it using `ssh-keygen -Y sign` with namespace `paidsoon-admin-auth`; server verifies the signature against the registered public key. Challenge is single-use and short-lived.
- `admin-session-elevation`: Short-lived elevated admin session model, distinct from the normal Supabase session. Admin APIs require a valid elevated session. Session expires after a configurable TTL (default 30 min). Sensitive actions may require re-verification.
- `admin-dashboard`: Protected `/admin` UI with sections for platform overview, tenants, users, subscriptions, integrations, email jobs, audit log, device management, staff management, and settings. Inaccessible to non-admin users.
- `admin-api`: All `/api/admin/*` endpoints with full authentication guard: valid Supabase user + platform role + active elevated admin session + device verification. Includes CRUD for tenants, users, subscriptions, integrations, email jobs, staff, devices, audit events.
- `tenant-impersonation`: Safe "view as tenant" mode. Admin explicitly starts the session; UI clearly indicates impersonation context; all actions are audited; destructive actions are blocked or require extra confirmation; secrets are never exposed in plaintext.
- `admin-audit-logging`: Immutable `AdminAuditEvent` table capturing actor, device, action, target, tenant, IP, user-agent, request ID, success/failure, and timestamp. Covers all admin lifecycle events.

### Modified Capabilities

- `subscription-plan-tiers`: No requirement change. Admin visibility into subscription state is additive read-only; existing billing logic is unchanged.

## Impact

- **New Prisma models**: `PlatformRole`, `AdminDevice`, `AdminChallenge`, `AdminSession`, `AdminAuditEvent`, `StaffInvitation`.
- **New migrations and RLS policies**: Admin tables isolated from tenant-level access; service role key never sent to browser.
- **New Next.js routes**: `/admin/**` pages (server components with middleware guard), `/api/admin/**` route handlers.
- **New middleware**: `middleware.ts` extended to block `/admin` routes for non-admin users and redirect unauthenticated users.
- **New lib modules**: `lib/admin/`, `lib/admin/auth.ts`, `lib/admin/challenge.ts`, `lib/admin/session.ts`, `lib/admin/audit.ts`, `lib/admin/devices.ts`, `lib/admin/staff.ts`.
- **Environment variables**: `ADMIN_ENABLED`, `ADMIN_REQUIRE_MFA`, `ADMIN_REQUIRE_DEVICE_KEY`, `ADMIN_SESSION_TTL_MINUTES`, `ADMIN_CHALLENGE_TTL_SECONDS`, `ADMIN_MAX_FAILED_ATTEMPTS`, `PLATFORM_OWNER_EMAIL`, `ADMIN_AUTH_REQUIRED`.
- **Dependencies**: Node `crypto` built-in (for signature verification) — no new runtime packages required for MVP Ed25519 verification. Optional: `@noble/ed25519` if Node crypto OpenSSH format parsing proves insufficient.
- **Docs**: `docs/DDD.md`, `docs/runbooks/README.md`, and new `docs/admin-security.md` must be updated.
- **Tests**: New test suite in `tests/admin-*.test.ts` covering unauthorised access, expired/reused challenges, invalid signatures, revoked devices, session expiry, and impersonation audit trails.
