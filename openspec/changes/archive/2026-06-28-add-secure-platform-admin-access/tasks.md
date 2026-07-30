## 1. Proposal and Approval

- [x] 1.1 Review `proposal.md`, `design.md`, and all `specs/*/spec.md` files for completeness and correctness
- [x] 1.2 Resolve open questions from `design.md` (Edge runtime vs Node for middleware checks; MFA enforcement model; first device bootstrap UX)
- [x] 1.3 Get explicit approval from platform owner before proceeding to implementation

## 2. Data Model

- [x] 2.1 Add `PlatformRole` model to `prisma/schema.prisma` with fields: `id`, `userId`, `role` (enum: `platform_owner`, `platform_admin`, `platform_support`), `status` (enum: `active`, `disabled`), `createdAt`, `createdBy`, `updatedAt`
- [x] 2.2 Add `AdminDevice` model with fields: `id`, `adminUserId`, `label`, `publicKeyBytes`, `publicKeyFingerprint`, `keyType`, `status` (enum: `pending`, `active`, `revoked`, `expired`), `createdAt`, `createdBy`, `revokedAt`, `revokedBy`, `lastVerifiedAt`, `lastUsedIp`, `lastUserAgent`
- [x] 2.3 Add `AdminChallenge` model with fields: `id`, `userId`, `nonce`, `expiresAt`, `usedAt`, `createdAt`, `ipAddress`, `userAgent`
- [x] 2.4 Add `AdminSession` model with fields: `id`, `userId`, `adminDeviceId`, `adminChallengeId`, `sessionToken`, `expiresAt`, `revokedAt`, `impersonatedTenantId`, `createdAt`, `ipAddress`, `userAgent`
- [x] 2.5 Add `AdminAuditEvent` model with all fields per spec (actorUserId, actorEmail, platformRole, adminDeviceId, adminDeviceFingerprint, action enum, targetType, targetId, tenantId, ipAddress, userAgent, requestId, success, reason, createdAt)
- [x] 2.6 Add `StaffInvitation` model with fields: `id`, `email`, `role`, `token`, `status`, `createdAt`, `createdBy`, `expiresAt`, `acceptedAt`, `acceptedByUserId`
- [x] 2.7 Run `npx prisma migrate dev --name add-secure-platform-admin-access` to generate migration
- [x] 2.8 Update `prisma/rls-policies.sql` to add deny-all RLS policies for all six new admin tables (deny SELECT/INSERT/UPDATE/DELETE for `anon` and `authenticated` roles)
- [x] 2.9 Run `npm run verify-rls` to confirm tenant clients cannot access admin tables
- [x] 2.10 Update `docs/DDD.md` with all new models and their relationships

## 3. SSH Key Utility

- [x] 3.1 Create `lib/admin/ssh.ts` with `parseOpenSshEd25519PublicKey(rawPubKey: string): Buffer` that validates and extracts the 32-byte Ed25519 public key from an OpenSSH `ssh-ed25519` public key string
- [x] 3.2 Add `computeKeyFingerprint(rawPubKey: string): string` in `lib/admin/ssh.ts` that returns the SHA-256 fingerprint in `SHA256:<base64>` format
- [x] 3.3 Add `verifySshKeySig(opts: { nonce: string; namespace: string; signature: string; publicKeyBytes: Buffer }): boolean` in `lib/admin/ssh.ts` using Node `crypto.verify` for Ed25519; reject any namespace other than `paidsoon-admin-auth`
- [x] 3.4 Write unit tests in `tests/admin-ssh.test.ts` covering: valid signature verifies, invalid signature rejected, wrong namespace rejected, malformed public key rejected, malformed signature rejected

## 4. Backend Admin Auth Guard

- [x] 4.1 Create `lib/admin/guard.ts` with `requireAdminElevation(req, opts)` helper that: (1) calls `supabase.auth.getUser()`; (2) looks up `PlatformRole` via `prismaAdmin`; (3) looks up and validates `AdminSession` via `sessionToken` cookie; (4) throws or returns a typed error for each layer
- [x] 4.2 Extend `middleware.ts` to intercept `/admin/*` and `/api/admin/*` paths: redirect unauthenticated users to `/sign-in`, redirect users with no platform role to `/dashboard`, redirect users without elevated session to `/admin/verify` for UI routes; return 401 JSON for API routes
- [x] 4.3 Write unit tests in `tests/admin-guard.test.ts` covering: no Supabase session returns 401, valid session but no platform role returns 403, valid role but no AdminSession returns 401, expired AdminSession returns 401, valid full context passes guard

## 5. SSH Challenge Verification API

- [x] 5.1 Create `app/api/admin/challenges/route.ts` — POST handler: validate Supabase session + platform role (no AdminSession required); rate-check failed attempts; generate nonce; create `AdminChallenge` row via `prismaAdmin`; create audit event; return `{challengeId, nonce}`
- [x] 5.2 Create `app/api/admin/challenges/[id]/verify/route.ts` — POST handler: validate Supabase session + platform role; look up `AdminChallenge` (check expiry, usedAt); look up `AdminDevice` (check active status, match userId); call `verifySshKeySig`; on success: mark challenge used, create `AdminSession`, set `admin_session` cookie, create audit event; on failure: create failure audit event, increment failure counter; return 200 or error
- [x] 5.3 Write tests in `tests/admin-challenge.test.ts` covering: expired challenge rejected, already-used challenge rejected, invalid signature rejected, wrong namespace rejected, revoked device rejected, valid signature creates session, rate limit triggers after N failures

## 6. Admin Session Management

- [x] 6.1 Create `app/api/admin/sessions/revoke/route.ts` — POST handler: require full admin guard; set `AdminSession.revokedAt = now()`; clear `admin_session` cookie; create audit event
- [x] 6.2 Update sign-out flow in `app/auth/sign-out/route.ts` to also revoke any active `AdminSession` for the user and clear the `admin_session` cookie
- [x] 6.3 Add `lib/admin/session.ts` with `getActiveAdminSession(sessionToken: string): AdminSession | null` and `revokeAdminSession(sessionId: string): void` helpers
- [x] 6.4 Write tests in `tests/admin-session.test.ts` covering: session past expiry rejected, revoked session rejected, sign-out clears admin session, device revocation cascades to sessions

## 7. Admin Audit Logging

- [x] 7.1 Create `lib/admin/audit.ts` with `logAdminEvent(event: AdminAuditEventInput): Promise<void>` that writes an `AdminAuditEvent` row via `prismaAdmin`
- [x] 7.2 Integrate `logAdminEvent` into all admin API route handlers (challenges, sessions, devices, staff, impersonation) — success and failure paths
- [x] 7.3 Add `app/api/admin/audit-events/route.ts` — GET handler with pagination and filtering by `actorUserId`, `action`, `tenantId`, `success`, date range; require full admin guard
- [x] 7.4 Write tests in `tests/admin-audit.test.ts` covering: audit event is created on session start, audit event is created on challenge failure, audit event is created on device revocation, audit events are paginated

## 8. Admin Device Management API

- [x] 8.1 Create `app/api/admin/devices/route.ts` — GET (list devices, full admin guard) and POST (enrol new device: validate public key format, compute fingerprint, reject duplicates, create `AdminDevice` row, log audit event)
- [x] 8.2 Create `app/api/admin/devices/[id]/revoke/route.ts` — POST handler: require full admin guard + `platform_owner` or `platform_admin` role; set device status to `revoked`; delete/revoke all `AdminSession` rows for the device; create audit event
- [x] 8.3 Write tests in `tests/admin-devices.test.ts` covering: invalid key format rejected, duplicate fingerprint rejected, valid enrolment creates device, revocation invalidates active sessions, revoked device cannot verify challenges

## 9. Owner Bootstrap and First Device Enrolment

- [x] 9.1 Create `scripts/seed-admin-owner.ts` that reads `PLATFORM_OWNER_EMAIL` and optionally `ADMIN_SSH_PUBLIC_KEY` from env; finds the Supabase user; creates `PlatformRole` row; optionally creates first `AdminDevice` row; is idempotent
- [x] 9.2 Add `"seed:admin-owner": "node --import tsx scripts/seed-admin-owner.ts"` to `package.json` scripts
- [x] 9.3 Update `docs/runbooks/README.md` with new environment variables: `ADMIN_ENABLED`, `ADMIN_REQUIRE_MFA`, `ADMIN_REQUIRE_DEVICE_KEY`, `ADMIN_SESSION_TTL_MINUTES`, `ADMIN_CHALLENGE_TTL_SECONDS`, `ADMIN_MAX_FAILED_ATTEMPTS`, `PLATFORM_OWNER_EMAIL`, `ADMIN_SSH_PUBLIC_KEY`

## 10. Staff Invitation and Role Management API

- [x] 10.1 Create `app/api/admin/staff/route.ts` — GET handler: list staff with roles; require full admin guard
- [x] 10.2 Create `app/api/admin/staff/invitations/route.ts` — POST handler: require `platform_owner` or `platform_admin` role; validate target email and role; create `StaffInvitation` row; send invitation email via `sendFollowUpEmail` or a new admin email template; log audit event
- [x] 10.3 Create invitation acceptance route — validates invitation token, assigns `PlatformRole` to the accepting user, marks invitation accepted, logs audit event
- [x] 10.4 Create `app/api/admin/staff/[userId]/role/route.ts` — POST handler: `platform_owner` only; update `PlatformRole.role`; log audit event
- [x] 10.5 Create `app/api/admin/staff/[userId]/disable/route.ts` — POST handler: `platform_owner` only; set `PlatformRole.status = disabled`; revoke all active `AdminSession` rows for user; log audit event
- [x] 10.6 Write tests in `tests/admin-staff.test.ts` covering: invitation created by owner, invitation accepted creates role, tenant admin cannot assign platform role, disabled staff cannot access admin, role change is audited

## 11. Admin Dashboard Shell

- [x] 11.1 Create `app/admin/layout.tsx` — server layout that calls admin guard; renders persistent admin session status indicator (role, device label, time remaining); renders navigation to all admin sections; shows impersonation banner when `impersonatedTenantId` is set
- [x] 11.2 Create `app/admin/page.tsx` — redirect to `/admin/overview`
- [x] 11.3 Create `app/admin/verify/page.tsx` — admin elevation challenge page: displays nonce, sign command instructions, signature input form; POSTs to `/api/admin/challenges` and `/api/admin/challenges/{id}/verify`
- [x] 11.4 Create `app/admin/overview/page.tsx` — system health summary (tenant count, active subscriptions, recent audit events, failed email jobs)
- [x] 11.5 Update `middleware.ts` to route `/admin/verify` through only auth + role check (no AdminSession required)

## 12. Admin Tenant, User, and Subscription Views

- [x] 12.1 Create `app/api/admin/tenants/route.ts` and `app/api/admin/tenants/[id]/route.ts` — GET handlers with full admin guard; return safe tenant data (no raw credentials)
- [x] 12.2 Create `app/api/admin/users/route.ts` — GET handler with pagination and search
- [x] 12.3 Create `app/api/admin/subscriptions/route.ts` — GET handler; mask Stripe payment card details
- [x] 12.4 Create `app/api/admin/integrations/route.ts` — GET handler; mask all `accessToken` and API key fields
- [x] 12.5 Create `app/api/admin/email-jobs/route.ts` — GET handler; return email job queue state and failures; never return `clientEmail` in logs
- [x] 12.6 Create corresponding admin page components: `app/admin/tenants/page.tsx`, `app/admin/users/page.tsx`, `app/admin/subscriptions/page.tsx`, `app/admin/integrations/page.tsx`, `app/admin/email-jobs/page.tsx`

## 13. Tenant Impersonation

- [x] 13.1 Create `app/api/admin/impersonation/start/route.ts` — POST handler: full admin guard; validate `tenantId`; set `AdminSession.impersonatedTenantId`; log `impersonation_started` audit event
- [x] 13.2 Create `app/api/admin/impersonation/end/route.ts` — POST handler: full admin guard; clear `AdminSession.impersonatedTenantId`; log `impersonation_ended` audit event
- [x] 13.3 Add impersonation banner component to admin layout (shown when `impersonatedTenantId` is set)
- [x] 13.4 Add destructive action confirmation requirement: any DELETE or irreversible mutation during impersonation requires `confirm: true` body field and logs `impersonation_destructive_action` audit event
- [x] 13.5 Write tests in `tests/admin-impersonation.test.ts` covering: start requires elevated session, impersonation is audited, end clears context, destructive action requires confirmation, session expiry ends impersonation, credentials masked during impersonation

## 14. Admin Device Management UI

- [x] 14.1 Create `app/admin/admin-devices/page.tsx` — lists all `AdminDevice` rows; shows enrolment form; allows revocation
- [x] 14.2 Create `app/admin/staff/page.tsx` — lists staff with roles; shows invitation form; allows disable and role change (`platform_owner` only)

## 15. Tests

- [x] 15.1 Ensure all test files created in earlier phases compile and pass: `npm run test`
- [x] 15.2 Add `tests/admin-access-control.test.ts` with integration-style tests: non-admin user is blocked from all admin routes, tenant admin is blocked, admin without elevated session is blocked, expired session is blocked
- [x] 15.3 Run `npm run verify-rls` and confirm all new admin tables are inaccessible to tenant Supabase clients

## 16. Security Review

- [x] 16.1 Review all admin route handlers for: missing auth guard layers, secrets exposed in responses, RLS bypass without comment, `prismaAdmin` usage in non-admin context
- [x] 16.2 Confirm `admin_session` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` on all Set-Cookie headers
- [x] 16.3 Confirm no admin-specific environment variables are prefixed `NEXT_PUBLIC_`
- [x] 16.4 Confirm challenge nonces are cryptographically random (at minimum 32 bytes from `crypto.randomBytes`)
- [x] 16.5 Confirm session tokens are cryptographically random (at minimum 32 bytes from `crypto.randomBytes`)
- [x] 16.6 Verify `ADMIN_REQUIRE_DEVICE_KEY=false` path is blocked in production (add guard: if `NODE_ENV === 'production' && ADMIN_REQUIRE_DEVICE_KEY === 'false'`, throw at startup)

## 17. Documentation

- [x] 17.1 Update `docs/DDD.md`: add all new models, API routes, and admin architecture narrative
- [x] 17.2 Update `docs/runbooks/README.md`: add all new environment variables with per-environment values and notes
- [x] 17.3 Create `docs/admin-security.md`: operator guide covering owner bootstrap, first device enrolment, daily admin login flow (SSH signing command), staff provisioning, device revocation, and emergency lockout procedure
- [x] 17.4 Add a note to `docs/admin-security.md` explaining the hardware-backed key recommendation for production (YubiKey/FIDO2) and the future WebAuthn/passkeys enhancement path
