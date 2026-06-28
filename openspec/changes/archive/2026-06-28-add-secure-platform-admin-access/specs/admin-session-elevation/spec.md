## ADDED Requirements

### Requirement: Elevated admin session is separate from normal Supabase session
The system SHALL create an `AdminSession` row upon successful challenge verification. The session is identified by a cryptographically random `sessionToken` (minimum 32 bytes, URL-safe base64). The `sessionToken` SHALL be set as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie named `admin_session` distinct from the Supabase auth cookie. The session row SHALL reference the `userId`, `adminDeviceId`, the verified `adminChallengeId`, and an `expiresAt` timestamp.

#### Scenario: Successful verification creates elevated session cookie
- **WHEN** a challenge is verified successfully
- **THEN** the server sets an `admin_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict` attributes

#### Scenario: Admin session expires after TTL
- **WHEN** `ADMIN_SESSION_TTL_MINUTES` have elapsed since session creation
- **THEN** the `AdminSession` row's `expiresAt` is in the past and admin API guards reject the request with 401

#### Scenario: Admin session is server-side verifiable
- **WHEN** an admin API guard reads the `admin_session` cookie
- **THEN** it looks up the `AdminSession` row by `sessionToken` and verifies `expiresAt > now()` and `revokedAt IS NULL`

---

### Requirement: Admin session cannot be used without a valid Supabase session
Admin API guards SHALL require both a valid Supabase auth session (via `supabase.auth.getUser()`) AND a valid `AdminSession` row. Loss of either SHALL deny access.

#### Scenario: Missing Supabase session denies admin access
- **WHEN** a request to `/api/admin/*` lacks a valid Supabase session
- **THEN** the guard returns 401 regardless of `admin_session` cookie presence

#### Scenario: Missing elevated session denies admin access
- **WHEN** a request to `/api/admin/*` has a valid Supabase session but no `admin_session` cookie
- **THEN** the guard returns 401 with `reason = elevation_required`

---

### Requirement: Admin session can be explicitly revoked
A `platform_owner` SHALL be able to revoke their own admin session or any staff member's admin sessions. Revoking a device SHALL automatically revoke all associated admin sessions. Logging out SHALL revoke the active admin session.

#### Scenario: Explicit session revocation
- **WHEN** a `platform_owner` POSTs to `/api/admin/sessions/revoke`
- **THEN** the `AdminSession.revokedAt` is set to now and the `admin_session` cookie is cleared

#### Scenario: Device revocation cascades to sessions
- **WHEN** a device is revoked
- **THEN** all `AdminSession` rows with `adminDeviceId = <revoked device id>` are deleted or marked revoked

#### Scenario: Sign-out clears elevated session
- **WHEN** an admin signs out via the normal sign-out flow
- **THEN** the `admin_session` cookie is cleared and the `AdminSession` row is revoked

---

### Requirement: Admin session records are audit-trailed
Session creation, expiry, and revocation events SHALL each create an `AdminAuditEvent` row.

#### Scenario: Session start is logged
- **WHEN** a new `AdminSession` is created after successful challenge verification
- **THEN** an `AdminAuditEvent` with `action = admin_session_started` is written

#### Scenario: Session revocation is logged
- **WHEN** an `AdminSession` is revoked
- **THEN** an `AdminAuditEvent` with `action = admin_session_revoked` is written

---

### Requirement: Short-lived session with configurable TTL
The session TTL SHALL be configurable via `ADMIN_SESSION_TTL_MINUTES` (default 30). The system SHALL reject sessions that have expired even if the row has not been explicitly deleted.

#### Scenario: Session past expiry is rejected
- **WHEN** a request is made with an `admin_session` cookie referencing a session where `expiresAt < now()`
- **THEN** the admin guard returns 401 with `reason = session_expired`

#### Scenario: TTL is configurable
- **WHEN** `ADMIN_SESSION_TTL_MINUTES=15` is set in the environment
- **THEN** newly created `AdminSession` rows have `expiresAt = createdAt + 15 minutes`
