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
| 1 | A valid Supabase session (normal login) | `proxy.ts` |
| 2 | An active `PlatformRole` row for the authenticated user | `lib/admin/guard.ts` |
| 3 | A live `AdminSession` cookie linked to a verified device | `lib/admin/guard.ts` |

Passing only layers 1 and 2 lands you on the `/admin/verify` challenge page,
where you must prove possession of a registered SSH private key before layer 3
is granted.

---

## Why challenge-response and not "upload my key"

The server **never sees or stores a private key**. What is stored in the
`admin_devices` table is the enrolled public key verification material plus the
SHA-256 fingerprint of your OpenSSH public key. Currently supported key types:
`ssh-ed25519` and `ecdsa-sha2-nistp256` (Touch ID Secure Enclave via OpenSSH).
The challenge flow is:

1. Server generates a random 32-byte nonce and stores it with a short TTL.
2. Your browser asks you to sign the nonce offline using your private key
   (via `ssh-keygen -Y sign`).
3. You paste the armoured signature into the browser.
4. Server verifies the signature against the stored device key using Node.js
   built-in `crypto.verify`. If valid, an `AdminSession` is issued and an
   `admin_session` cookie is set.

Because the private key never leaves your machine, a network interception or
server breach cannot recover it.

---

## Hardware-key recommendation (important for production)

A software SSH private key file (`~/.ssh/id_ed25519`) **can be copied** if your
machine is compromised (malware, stolen laptop, etc.). For production use,
strongly prefer a hardware-backed key:

| Key type | How to generate | Threat mitigated |
|---|---|---|
| macOS Secure Enclave | `ssh-keygen -t ecdsa-sk` (Touch ID) | Key lives in T2/M-series chip; requires biometric confirmation per use |
| Software Ed25519 key | `ssh-keygen -t ed25519 -f ~/.ssh/paidsoon_admin_ed25519` | Baseline key-based challenge-response |

The PaidSoon admin challenge flow currently supports OpenSSH key types
`ssh-ed25519` and `ecdsa-sha2-nistp256`.

> Note: OpenSSH security-key key types such as `sk-ssh-ed25519@openssh.com`
> are not supported yet. Enrolling those keys currently fails server-side.

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
2. Paste the contents of your `*.pub` file (OpenSSH `ssh-ed25519` or
   `ecdsa-sha2-nistp256`).
3. Give the device a descriptive name (e.g. `MacBook Pro 2025 – Touch ID`).
4. Submit. The server validates the key type, stores verification material and
   the SHA-256 fingerprint, and never returns key bytes to the browser.

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

### Trial-access management boundary — in progress, not rolled out

The six trial-management routes and converted legacy extension adapter are present
in the working tree, not deployed. All require real authenticated identity, active
`platform_owner`, valid unrevoked elevation and an active device belonging to that
owner before target reads. Both impersonation modes are rejected. Elevated
`platform_admin` and `platform_support` retain tenant-health reads, not trial
management authority. `ADMIN_ENABLED` and device-key settings remain unchanged;
there is no new trial feature flag. See [exact route contracts](DDD.md#owner-trial-route-contract--in-progress-not-rolled-out).

| Operation | Current authority and journal scope |
| --- | --- |
| Preview/confirmation (including legacy adapter) | Current owner authority; confirmation is tenant/original-actor/**original-session** bound. New elevation cannot confirm an old preview. |
| Operation status/reconcile | Current owner authority and **same original actor**, any current elevated session, including after original-session expiry. A different owner cannot substitute. |
| Notification retry | Current owner authority plus original actor/**original session**; the recovery exception does not apply. |

All POSTs require exact matching `Origin` and reject cross-site fetch metadata;
strict JSON envelopes, UUID paths and no-query validation are shared. Private
no-store responses project safe state, not raw journal rows. The legacy URL accepts
only preview-backed `{operationId,expectedVersion}`, never the old `{days}` body,
and dispatches only stored Stripe extension intent. Reason is required at preview,
not supplied again at confirmation. There is no diagnostic mutation bypass.

The target organisation is the existing `UserProfile.userId` billing tenant.
Debtor customers and linked accounting-provider organisations are not targets.
Current-grant state is independent of Stripe billing projections; grants must not
forgive subscription debt/disputes, replace paid plans or resume subscriptions.
Accepted operations retain required reasons and mandatory append-only audit;
notification failures remain separate from access outcomes in the runtime service.

Trial events reuse `action: admin_tenant_action`, `targetType: user_profile`,
tenant target fields and operation `resourceId`. Metadata `action` is
`trial_attempt`, `trial_result`, `trial_recovery` or `trial_notification`, with
`operationId`, `operationAction`, `source`, UTC `occurredAt`, allowlisted
`previous`/`after` snapshots and `result`. Snapshots retain billing/grant/effective
plans and expiries, provider binding and version for restricted audit review.
The trimmed business `reason` is a separate privileged column, not an error summary
or notification content. Actor/session/device and current request context stay in
audit columns; raw payloads, keys, contacts and provider errors are excluded.

Initial mandatory audit failure prevents access/provider mutation. Local access,
success audit and requested outbox commit together; Stripe acceptance/reservation
and attempt audit commit before dispatch. A failed final commit leaves recovery,
not fabricated success. `TenantTrialOperation.adminSessionId` always retains the
original session. A claimed recovery appends `trial_recovery` using the **current**
audit `adminSessionId` and metadata `originalSessionId`/`recoveringSessionId`, even
when equal; no prior journal/audit attribution is rewritten. Notification audit
adds `executor: owner|system` and `phase: attempt|result`; delivery state is not
access success. Unrelated best-effort `logAdminEvent()` callers are unchanged.

Full persistence/security rollout is in progress, not deployed. The earlier
four-trial-table development containment is separately applied and unchanged;
new customer journal migration/CHECK/policy artifacts remain unapplied. Customer
roles may read only their own safe grant/risk columns; operation journals,
notification recipients/payloads and audit remain private. Customer profile
INSERT and billing-column UPDATE authority are removed by the prepared policy.
Deploy verified billing-writer and onboarding conversions before activating it.

Task 3.9's offline subset drafts canonical/targeted RLS and explicit table/column
revocations for the customer journal and immutable steps. Both owner and customer
journals are server-only, including for their own tenant; anonymous roles have
no journal reads/writes either. No direct Data API status path is granted. Customer
status/recovery services now authenticate and scope own-operation projections
before privileged access in the working tree; the policy-only subset did not
implement or deploy those services or the pre-call coordinator. Raw requests,
frozen email/metadata, keys, leases and provider evidence must never enter client
responses or logs.

`pendingBillingMutationId` INSERT/UPDATE grants and overriding profile table
UPDATE are revoked in the drafted addition. The full existing trial policy is
still required for other billing/version/owner-reservation restrictions. Safe
own-name/onboarding/timestamp updates remain available under tenant RLS. Revoke
client/PUBLIC public-table creation defaults for the canonical `postgres` creator
before journal creation; review any other creator/defaults. Roll out generated
migration, separate actor/exclusivity CHECKs and both full policy blocks under
separate authorization with no exposed intermediate tables, after writer
conversion. Never deploy the journal migration alone or restore customer billing
privileges to keep a legacy writer running.

New rollback-only verification modes `--billing-mutations-staged` and
`--billing-mutations` require an explicitly reviewed isolated project ref matching
the canonical adapter via `--reviewed-isolated-target=<project-ref>`. Staging
conditionally adds pending schemas/lease/journals/CHECKs and full policies on one
connection, strips only CHECK transaction wrappers in memory and always rolls
back. It writes no SQL files/migration history and never calls persistent legacy
cleanup. Probes cover tenant FKs, actor equality, same-tenant parent/steps,
reservation exclusivity, both journals/step ACLs, safe reads/name edits and denied
customer/anon authority writes. These probes were **not run** in this offline
subset; static contracts are not live proof. Tasks 3.8/3.9/9.3 remain unchecked.
Existing `--trial-access-tables` containment verification is preserved. No live
database command or additional shared application is authorized by this work.

Runtime owner/audit/delivery work does not remove deployment blockers: pending
migrations/CHECKs/full RLS and isolated validation (3.8/3.9/9.3), entitlement/API/job
integration (5/6), management UI (8) and release verification remain unfinished.
Keep management unavailable until the [release gate](runbooks/vercel.md#12-trial-access-and-customer-billing-journal-release-gate)
passes; preserve catalog/readiness gates. Operational recovery and delivery-only
rules are in [admin §9](runbooks/admin.md#9--trial-access-operations--in-progress-not-rolled-out)
and [Resend §7](runbooks/resend.md#7-trial-access-notifications--in-progress-not-rolled-out).

Local staged isolation checks roll back DDL, privileges and probe data; they are
not a production migration. The rollback plan retains active grants and effective
access enforcement, disables management, and reconciles unknown provider outcomes
without automatically shortening Stripe trials or deleting audit/journal/step
history. Retain both unresolved reservations and recovery; lease expiry alone
does not permit another mutation or release uncertainty.

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
