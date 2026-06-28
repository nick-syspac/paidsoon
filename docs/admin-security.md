# Platform Admin Security Guide

This document is the operator guide for the PaidSoon platform admin system.
It covers how the three-layer guard works, how to onboard new staff, how to
manage SSH devices, and the security properties you should understand before
using the system in production.

---

## How the three-layer guard works

Access to any `/admin` route requires **all three** of the following to be
satisfied in sequence:

| Layer | What is checked | Enforced by |
|---|---|---|
| 1 | A valid Supabase session (normal login) | `middleware.ts` |
| 2 | An active `PlatformRole` row for the authenticated user | `lib/admin/guard.ts` |
| 3 | A live `AdminSession` cookie linked to a verified device | `lib/admin/guard.ts` |

Passing only layers 1 and 2 lands you on the `/admin/verify` challenge page,
where you must prove possession of a registered SSH private key before layer 3
is granted.

---

## Why challenge-response and not "upload my key"

The server **never sees or stores a private key**. What is stored in the
`admin_devices` table is the 32-byte Ed25519 *public key* extracted from your
`id_ed25519.pub` file. The challenge flow is:

1. Server generates a random 32-byte nonce and stores it with a short TTL.
2. Your browser asks you to sign the nonce offline using your private key
   (via `ssh-keygen -Y sign`).
3. You paste the armoured signature into the browser.
4. Server verifies the signature against the stored public key bytes using
   Node.js built-in `crypto.verify` (Ed25519). If valid, an `AdminSession`
   is issued and an `admin_session` cookie is set.

Because the private key never leaves your machine, a network interception or
server breach cannot recover it.

---

## Hardware-key recommendation (important for production)

A software SSH private key file (`~/.ssh/id_ed25519`) **can be copied** if your
machine is compromised (malware, stolen laptop, etc.). For production use,
strongly prefer a hardware-backed key:

| Key type | How to generate | Threat mitigated |
|---|---|---|
| YubiKey resident key | `ssh-keygen -t ed25519-sk -O resident` | Private key is stored in secure element; cannot be exported |
| macOS Secure Enclave | `ssh-keygen -t ecdsa-sk` (Touch ID) | Key lives in T2/M-series chip; requires biometric confirmation per use |
| FIDO2 hardware key | `ssh-keygen -t ed25519-sk` | Same as YubiKey; works with any FIDO2 token |

The PaidSoon admin challenge flow is compatible with all three because they all
produce standard `ssh-keygen -Y sign` output. The server code does not need
to change when you upgrade from a software key to a hardware key — you simply
enrol the new public key as a new device.

---

## Bootstrapping the first platform owner

Run the seed script once against your target database. It is idempotent — safe
to re-run if something went wrong.

```bash
# Required
PLATFORM_OWNER_EMAIL=you@example.com \
  node --import tsx scripts/seed-admin-owner.ts

# Optional: also enrol a device on first boot
PLATFORM_OWNER_EMAIL=you@example.com \
ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/id_ed25519.pub)" \
  node --import tsx scripts/seed-admin-owner.ts
```

The script:
1. Looks up the Supabase user by `PLATFORM_OWNER_EMAIL`.
2. Creates a `PlatformRole` row with `role = platform_owner` if one does not
   already exist.
3. If `ADMIN_SSH_PUBLIC_KEY` is set, parses the public key, computes the
   fingerprint, and creates an `AdminDevice` row with `status = active`.

After this runs you can navigate to `/admin`, complete layers 1 and 2, and then
use the challenge page to sign a nonce with your private key and receive an
`AdminSession`.

---

## Inviting more staff

Only a `platform_owner` or `platform_admin` can invite new staff.

1. From `/admin/staff`, click **Invite staff member**.
2. Enter the email address and choose a role (`platform_support`,
   `platform_admin`, or `platform_owner`).
3. An invitation email is sent. The link contains a 32-byte random token.
4. The invitee clicks the link, logs in with the matching Supabase account, and
   the invitation is accepted. A `PlatformRole` row is created automatically.

Only a `platform_owner` can promote a member to `platform_owner`.

---

## Enrolling an SSH device

After gaining a session (layers 1–3), navigate to `/admin/admin-devices`.

1. Click **Enrol new device**.
2. Paste the contents of your `*.pub` file (OpenSSH `ssh-ed25519` format only).
3. Give the device a descriptive name (e.g. `MacBook Pro 2025 – Touch ID`).
4. Submit. The server extracts the 32-byte key and stores the SHA-256
   fingerprint. The raw public key bytes are stored but never returned to
   the browser.

To remove a device, click **Revoke**. Revoking a device immediately invalidates
all `AdminSession`s that were created using that device.

---

## Session cookie properties

| Property | Value | Why |
|---|---|---|
| Name | `admin_session` | Distinct from the Supabase session cookie |
| `HttpOnly` | true | Browser JS cannot read or steal the token |
| `Secure` | true | Only transmitted over HTTPS |
| `SameSite` | `Strict` | Prevents CSRF across origins |
| TTL | `ADMIN_SESSION_TTL_MINUTES` (default 60 min in prod) | Short-lived; forces re-challenge after idle period |

The session is also revoked server-side:
- Explicitly by `/api/admin/sessions/revoke` (sign out of admin)
- When the associated device is revoked
- When the staff member's `PlatformRole` is disabled
- On global sign-out (`/auth/sign-out`) — revokes all AdminSessions for the user

---

## Audit log

Every significant action writes an `AdminAuditEvent` row (see
`AdminAuditAction` enum for the full 22-action list). The table is
append-only — no UPDATE or DELETE policy exists. View events at
`/admin/overview` (recent) or query `/api/admin/audit-events` with filters.

Sensitive fields (`clientEmail`, `amountDue`) are never written to audit
metadata. PII in tenant data is not included in audit events.

---

## Environment variables

| Variable | Production value | Notes |
|---|---|---|
| `ADMIN_ENABLED` | `true` | Must be set to enable `/admin` routes |
| `ADMIN_REQUIRE_DEVICE_KEY` | `true` | **Must be `true` in production.** Never ship without this. |
| `ADMIN_SESSION_TTL_MINUTES` | `60` | Shorter = more secure |
| `ADMIN_CHALLENGE_TTL_SECONDS` | `120` | Window to submit a signed challenge |
| `ADMIN_MAX_FAILED_ATTEMPTS` | `5` | Failed challenges before temporary lockout |

See `docs/runbooks/README.md` for local/preview/production values.

---

## Threat model summary

| Threat | Mitigation |
|---|---|
| Stolen session cookie | HttpOnly; SameSite=Strict; short TTL; server-side revocable |
| Stolen SSH private key (software key) | Upgrade to hardware key (YubiKey / Secure Enclave) |
| Brute-force challenge submission | `ADMIN_MAX_FAILED_ATTEMPTS` locks out after N failures; audit logged |
| Insider threat (compromised staff account) | Audit log; `platform_owner` can disable and revoke sessions immediately |
| Server-side DB breach | Public key bytes are not secret; no private keys stored |
| Replay of used challenge | `AdminChallenge.usedAt` is set atomically on first use; replays rejected |
| Cross-tenant data leakage via impersonation | Admin cannot impersonate other platform admins; every impersonation start/end is audit-logged |
