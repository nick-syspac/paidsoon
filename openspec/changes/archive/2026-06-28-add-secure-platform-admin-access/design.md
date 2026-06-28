## Context

PaidSoon is a Next.js 16 / Supabase / Prisma application deployed on Vercel. It currently has no internal platform administration capability. All tenant data is isolated using Supabase RLS tied to `auth.uid()`. The existing auth model supports only tenant-level roles (`tenant_owner`, `tenant_admin`, `tenant_user`). There is no concept of a platform operator or staff role.

The founding team needs a secure, auditable way to inspect the platform, manage tenants, investigate failures, and operate the product without direct database access. The design must not weaken tenant data isolation or allow any non-authorised account to access platform internals.

The central security constraint is: **admin access must be bound to a specific trusted device via SSH key challenge-response, not merely by password or session cookie**. The SSH private key must never leave the device; the server stores only the public key or its fingerprint.

## Goals / Non-Goals

**Goals:**
- Define a platform-level role model (`platform_owner`, `platform_admin`, `platform_support`) independent of tenant roles.
- Design a secure admin bootstrap mechanism for the first owner account.
- Design an SSH Ed25519 challenge-response flow that proves control of an approved private key without transmitting it.
- Design short-lived elevated admin sessions separate from normal Supabase auth sessions.
- Design an admin device registry (public key/fingerprint store) with enrolment, active/revoked/expired states, and immediate revocation.
- Design a `StaffInvitation` workflow so named staff can be provisioned with their own device keys.
- Design full immutable audit logging of every admin action.
- Design protected `/admin` UI and `/api/admin/*` API with layered guards (Supabase auth → platform role → elevated session → device verification).
- Design safe tenant impersonation with audit trail and blocked destructive actions.
- Define RLS policies that keep admin tables isolated from tenant-level database clients.
- Define environment variables and feature flags for admin behaviour.

**Non-Goals:**
- Storing SSH private keys anywhere (database, environment variables, browser, logs).
- Shared admin accounts.
- Admin access for normal customer users or tenant admins.
- Exposing raw payment card data or plaintext secrets.
- Bypassing tenant RLS without an audit trail.
- Permanent unrestricted admin sessions.
- Public self-service admin signup.
- WebAuthn/FIDO2 integration in MVP (noted as future enhancement).
- Admin impersonation that allows destructive tenant actions without additional confirmation.

## Decisions

### D1: Platform roles stored in Prisma/Postgres, not Supabase Auth metadata

**Decision:** Platform roles are stored in a new `PlatformRole` table in Postgres (via Prisma), not in Supabase Auth user metadata.

**Rationale:** Supabase Auth metadata (`raw_user_meta_data`) is accessible to the client SDK. Storing platform roles there risks accidental client-side exposure. A server-only Postgres table, read only via `prismaAdmin` (bypassing RLS for admin operations), keeps platform roles invisible to the tenant-facing Supabase client. RLS policies will explicitly deny tenant clients from reading the `platform_roles` table.

**Alternative considered:** JWT custom claims via Supabase Auth hook. Rejected because JWT claims are visible in the browser, and any claim in the JWT could be inspected by the tenant; it also couples platform role changes to JWT refresh cycles.

---

### D2: SSH challenge-response using `ssh-keygen -Y sign` with fixed namespace

**Decision:** Admin elevation uses a challenge-response where the server generates a one-time nonce, the admin signs it locally using `ssh-keygen -Y sign -f <key> -n paidsoon-admin-auth`, and the server verifies using Node's `crypto` module (OpenSSH Ed25519 signature verification) against the stored public key.

**Rationale:** This is the standard SSH-agent signing protocol. The namespace (`paidsoon-admin-auth`) is fixed server-side so signatures generated for any other purpose are rejected. This means a compromised server cannot be used to trick a client into signing something harmful for another system. Ed25519 is preferred over RSA: smaller keys, faster verification, resistant to timing attacks.

**Signature verification approach:** Node.js 18+ `crypto.verify()` supports Ed25519 natively. The SSH wire format (OpenSSH `ssh-ed25519` public key blob) must be parsed to extract the raw 32-byte Ed25519 public key for use with `crypto.createPublicKey`. A small internal utility (`lib/admin/ssh.ts`) handles OpenSSH public key parsing and `ssh-keygen -Y sign` output format verification.

**Alternative considered:** Using a third-party library (`ssh2`, `@noble/ed25519`). Kept as fallback if OpenSSH format parsing proves complex, but Node crypto is preferred to avoid new runtime dependencies.

**MVP signing command (documented for operators):**
```
echo "<nonce>" | ssh-keygen -Y sign -f ~/.ssh/paidsoon_admin_ed25519 -n paidsoon-admin-auth
```
The namespace string `paidsoon-admin-auth` is validated server-side and cannot be overridden by the client.

---

### D3: Elevated admin session stored server-side in Postgres, not in a cookie claim

**Decision:** A successful admin challenge verification creates an `AdminSession` row in Postgres with a short-lived expiry (`ADMIN_SESSION_TTL_MINUTES`, default 30). The session is identified by a securely generated opaque token (`sessionToken`) sent to the client as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie distinct from the Supabase auth cookie.

**Rationale:** Keeping the elevated session server-side means revocation is immediate: deleting the `AdminSession` row invalidates the session without waiting for a JWT to expire. The Supabase session alone is insufficient for admin access; even if the Supabase cookie is stolen, the attacker still cannot access admin APIs without the device-verified elevated session token and active `AdminSession` row.

**Alternative considered:** Storing admin elevation as a claim in the Supabase JWT via a custom Auth hook. Rejected because JWT claims cannot be revoked without re-issuing the token; immediate revocation (e.g., device revocation) would be impossible without a session blocklist.

---

### D4: Admin challenge nonces are single-use, short-lived, and namespaced

**Decision:** Each `AdminChallenge` row has a `usedAt` field. The verify endpoint marks it used atomically. Challenges expire after `ADMIN_CHALLENGE_TTL_SECONDS` (default 120 seconds). Both expiry and used status are checked before verification. After `ADMIN_MAX_FAILED_ATTEMPTS` (default 5) consecutive failures for a user, challenge creation is rate-limited.

**Rationale:** Single-use prevents replay attacks. Short TTL minimises the window for an offline brute-force attempt (Ed25519 is not practically brute-forceable, but defence in depth). The rate limit mitigates scripted attack loops.

---

### D5: Admin middleware guard using layered checks

**Decision:** The Next.js `middleware.ts` is extended to intercept all `/admin` and `/api/admin` paths with a three-layer check:
1. Valid Supabase auth session (`supabase.auth.getUser()`).
2. Platform role exists in `PlatformRole` table for that user (checked via a fast indexed lookup using `prismaAdmin`).
3. Valid, non-expired `AdminSession` row with matching `sessionToken` cookie.

Layer 1 uses the existing Supabase cookie. Layers 2 and 3 are backend-only lookups. The middleware redirects or returns 401/403 at the appropriate layer.

**Rationale:** Defence in depth. Frontend hiding is not a security control. Every admin API route also independently performs these checks (middleware is not the only guard).

---

### D6: Tenant impersonation is a distinct, audited, short-lived context

**Decision:** Impersonation is modelled as a flag on the `AdminSession` (`impersonatedTenantId`). Starting impersonation updates the session row, creates an audit event, and sets a visible UI header. Ending impersonation clears the flag and creates another audit event. Destructive operations (DELETE, irreversible mutations) during impersonation require an additional confirmation prompt and an elevated audit entry. Secrets and credentials are never returned from impersonation-context API calls.

---

### D7: Admin tables use `prismaAdmin` exclusively; never `withUserContext`

**Decision:** All admin table reads/writes use `prismaAdmin` (service-role bypass). Admin tables (`platform_roles`, `admin_devices`, `admin_challenges`, `admin_sessions`, `admin_audit_events`, `staff_invitations`) have RLS policies that deny all access to the Supabase anon/authenticated roles. Only the Postgres service role (used by `prismaAdmin`) can read or write them.

**Rationale:** Prevents any tenant-facing code path from accidentally querying admin tables. The RLS deny policies are the authoritative guard; the code convention (always use `prismaAdmin` for admin tables) is a secondary layered control.

---

### D8: Owner bootstrap via environment variable, not public signup

**Decision:** The first `platform_owner` is seeded by running `npm run seed:admin-owner` in a controlled environment. The script reads `PLATFORM_OWNER_EMAIL` from the environment, finds the matching Supabase user, and writes a `PlatformRole` row using `prismaAdmin`. The script is idempotent and fails loudly if the user does not exist. It cannot be triggered via an HTTP endpoint.

**Rationale:** Public self-service platform owner creation is a critical security flaw. The seed script is the single controlled entry point. In production, it runs once from a secure terminal session with the `DIRECT_URL` set.

---

### D9: Ed25519 key validation on enrolment

**Decision:** When an admin device is enrolled, the submitted public key is parsed and validated as a valid OpenSSH `ssh-ed25519` key. An BLAKE2b/SHA-256 fingerprint is computed and stored. Duplicate fingerprints are rejected. The raw public key bytes (not the private key) are stored for signature verification.

---

### D10: Audit log is append-only; no delete or update path

**Decision:** `AdminAuditEvent` rows are never updated or deleted by application code. The table has a Postgres `CHECK` constraint on `created_at` (cannot be set to a past timestamp) and no `UPDATE`/`DELETE` permissions in RLS or application code. Log rotation, if ever needed, is a DBA-level operation with explicit approval.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| SSH private key compromise on the trusted machine | Document recommendation to use hardware-backed SSH key (YubiKey/FIDO2) for production. MVP uses software key; design explicitly notes this limitation. Future enhancement adds WebAuthn/passkeys. |
| OpenSSH `ssh-keygen -Y sign` output format parsing complexity | Implement a narrow `lib/admin/ssh.ts` with targeted format parsing and unit tests. Fall back to `@noble/ed25519` if needed. |
| `prismaAdmin` accidentally used in tenant-facing code | ESLint custom rule (or code review gate) to flag `prismaAdmin` imports in non-admin paths. Clear comment in `lib/db/admin.ts` restricting use. |
| Admin middleware adds latency to all `/admin` requests | Middleware lookups use indexed queries (`userId` + `sessionToken` indexed). Acceptable for low-traffic admin area. |
| Admin session cookie theft (if TLS is compromised) | `HttpOnly`, `Secure`, `SameSite=Strict` mitigate XSS/CSRF. TLS is enforced by Vercel. Defence in depth: even with the cookie, attacker lacks device key for re-elevation. |
| Replay attack using a captured signed challenge | Challenges are single-use (marked `usedAt` atomically). Short TTL further limits replay window. |
| Staff member loses/retains access after offboarding | Admin dashboard includes immediate device revocation. Device revocation invalidates active `AdminSession` rows for that device. Platform owner can also disable the staff account entirely. |
| Vercel Edge runtime limitations | Admin middleware checks must be compatible with Edge runtime (no native Prisma calls in Edge). Move role/session lookups to a lightweight edge-compatible lookup or use Supabase client for the role check at the edge boundary, with full Prisma check in the route handler. |

## Migration Plan

1. **Schema migration**: Add `PlatformRole`, `AdminDevice`, `AdminChallenge`, `AdminSession`, `AdminAuditEvent`, `StaffInvitation` tables to `prisma/schema.prisma`. Run `npx prisma migrate dev --name add-secure-platform-admin-access`.
2. **RLS policies**: Add deny-all policies for admin tables to `prisma/rls-policies.sql`. Run `npm run verify-rls`.
3. **Owner bootstrap**: After deploying the migration, run `npm run seed:admin-owner` once in the production environment with `PLATFORM_OWNER_EMAIL` set.
4. **Feature flag**: Deploy with `ADMIN_ENABLED=false` first. Enable after smoke testing in preview environment.
5. **Rollback**: If critical issues are found, set `ADMIN_ENABLED=false` to disable all admin routes without a schema rollback. A full rollback would require a down migration dropping the new tables.

## Open Questions

- **Edge runtime vs Node runtime for middleware admin checks**: Vercel Edge middleware cannot use Prisma directly. Options: (a) move `/admin` route protection to a Node.js server action within the layout rather than middleware; (b) use a lightweight Supabase RPC for the role check at the edge and do the full Prisma session check in the route handler. **Decision needed before implementation.**
- **MFA enforcement**: Supabase Auth MFA (TOTP) can be required via Auth policies. Should we enforce MFA at the Supabase level for `platform_owner`/`platform_admin` accounts, or check `amr` claim in the JWT inside our own guard? The latter is more explicit. **Decision needed before implementation.**
- **Admin device enrolment UX**: For MVP, enrolment may be a CLI command that POSTs the public key. Should there be a UI enrolment flow inside `/admin/admin-devices`? The first enrolment is a chicken-and-egg problem (you need admin access to enrol, but you need a device to get admin access). **Proposed solution: first device is enrolled via the seed/bootstrap script alongside owner bootstrap. Subsequent devices use the admin UI.**
- **Local development**: `ADMIN_REQUIRE_DEVICE_KEY=false` in development to allow testing without an SSH key. This flag must never be `false` in production.
