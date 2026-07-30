# Admin Setup Runbook

This runbook walks through bootstrapping the PaidSoon platform admin from scratch, including
environment variables, SSH key setup, seeding the first platform owner, and completing the
first login. Refer to [admin-security.md](../admin-security.md) for the full threat model and
guard layer explanation.

---

## Prerequisites

- The Supabase project, database schema, and RLS policies are already applied
  ([supabase.md](./supabase.md)).
- The app is running or deployed ([vercel.md](./vercel.md)).
- The operator's Supabase Auth account already exists — they must have signed up via
  the app before you run the seed script. The seed script looks up the user by email
  and will fail if no matching account exists.

---

## §1 — Generate an SSH key pair

The admin challenge-response system uses **Ed25519** keys only. Skip this section if you
already have a suitable key.

**Software key (local / dev):**

```bash
ssh-keygen -t ed25519 -C "paidsoon-admin" -f ~/.ssh/paidsoon_admin_ed25519
# Leave the passphrase blank or set one — your choice for dev.
# Public key is at: ~/.ssh/paidsoon_admin_ed25519.pub
```

**Hardware key — recommended for production:**

| Token | Command | Notes |
|---|---|---|
| YubiKey (resident) | `ssh-keygen -t ed25519-sk -O resident -C "paidsoon-admin"` | Key stored on device; cannot be exported |
| macOS Secure Enclave | `ssh-keygen -t ecdsa-sk -C "paidsoon-admin"` | Requires Touch ID per signing operation |
| Any FIDO2 key | `ssh-keygen -t ed25519-sk -C "paidsoon-admin"` | Prompts for physical tap on each use |

The server only ever stores the public key. You **never** upload or share your private key.

---

## §2 — Environment variables

Add these to `.env.local` for local development, or to Vercel environment variables
for preview/production. See the [README env matrix](./README.md) for the full table.

### Local / dev

```bash
ADMIN_ENABLED=true
ADMIN_REQUIRE_DEVICE_KEY=false   # set false locally to skip the SSH challenge (dev convenience only)
ADMIN_SESSION_TTL_MINUTES=480    # 8 hours
ADMIN_CHALLENGE_TTL_SECONDS=300  # 5 minutes to submit a signed challenge
ADMIN_MAX_FAILED_ATTEMPTS=10
```

### Production (Vercel)

```bash
ADMIN_ENABLED=true
ADMIN_REQUIRE_DEVICE_KEY=true    # MUST be true in production — never ship without this
ADMIN_SESSION_TTL_MINUTES=60     # 1 hour
ADMIN_CHALLENGE_TTL_SECONDS=120  # 2 minutes to submit a signed challenge
ADMIN_MAX_FAILED_ATTEMPTS=5
```

> **`ADMIN_REQUIRE_DEVICE_KEY=false` bypasses the SSH challenge entirely.** Never set this
> to `false` in production. The code enforces this at startup — if `NODE_ENV=production`
> and this flag is `false`, the app throws on startup.

---

## §3 — Seed the first platform owner

The seed script is idempotent — safe to run multiple times for the same email.

It requires `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SECRET_KEY` which
are already in `.env.local` (or set in the shell for a production run).

**Role only (enrol device via UI later):**

```bash
PLATFORM_OWNER_EMAIL=you@example.com \
  node --import tsx scripts/seed-admin-owner.ts
```

**Role + first device in one step (recommended):**

```bash
PLATFORM_OWNER_EMAIL=you@example.com \
ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/paidsoon_admin_ed25519.pub)" \
ADMIN_DEVICE_LABEL="My MacBook 2025" \
  node --import tsx scripts/seed-admin-owner.ts
```

Or use the npm script:

```bash
PLATFORM_OWNER_EMAIL=you@example.com \
ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/paidsoon_admin_ed25519.pub)" \
  npm run seed:admin-owner
```

Expected output on first run:

```
Seeding platform owner for: you@example.com
Found Supabase user: <uuid>
Created platform_owner role.
Enrolled admin device: My MacBook 2025 (SHA256:xxxx…)
Done.
```

---

## §4 — Find your device ID

The challenge page requires your **device UUID** (not the fingerprint). After seeding,
retrieve it with a direct database query:

```sql
SELECT id, label, public_key_fingerprint, status
FROM admin_devices
WHERE admin_user_id = (
  SELECT id FROM auth.users WHERE email = 'you@example.com'
);
```

Run this against the Supabase SQL editor (Dashboard → SQL Editor) or via:

```bash
npx prisma studio
# Navigate to AdminDevice, filter by adminUserId
```

Copy the `id` column value (a UUID) — you will need it in §5.

---

## §5 — Complete the first admin login

### Layer 1 — Supabase session

Navigate to `/sign-in` and sign in with the platform owner email.

### Layer 2 — Platform role check

Navigate to `/admin`. The middleware confirms your `PlatformRole` is `active`. If the
role is missing or the seed script was not run, you will see a 403 page. Re-run the seed
script and reload.

### Layer 3 — SSH challenge (production) / bypassed (dev with `ADMIN_REQUIRE_DEVICE_KEY=false`)

You will be redirected to `/admin/verify`.

**If `ADMIN_REQUIRE_DEVICE_KEY=false` (local dev):**
The verify page will issue an `AdminSession` without a signature. Click through —
no SSH signing is needed.

**If `ADMIN_REQUIRE_DEVICE_KEY=true` (production):**

1. Enter the device UUID from §4 into the **Device ID** field and click
   **Request challenge**.
2. The page shows a base64 nonce. Sign it offline:

   ```bash
   # Replace <nonce> with the exact value shown on screen
   echo -n "<nonce>" | ssh-keygen -Y sign \
     -f ~/.ssh/paidsoon_admin_ed25519 \
     -n paidsoon-admin \
     -q
   ```

   For hardware keys, the command is identical — your terminal will prompt for a tap or
   biometric confirmation.

3. Copy the full armoured signature output (including the `-----BEGIN SSH SIGNATURE-----`
   header and footer).
4. Paste it into the **Signature** field and click **Verify**.

On success you are redirected to `/admin/overview` and the `admin_session` cookie is set.
The session is valid for `ADMIN_SESSION_TTL_MINUTES` minutes.

---

## §6 — Invite additional staff

Once logged in as `platform_owner`:

1. Go to `/admin/staff` → **Invite staff member**.
2. Enter the invitee's email and choose a role:
   - `platform_support` — read-only access to tenant data and audit logs.
   - `platform_admin` — can manage staff, tenants, and subscriptions.
   - `platform_owner` — full access; only a `platform_owner` can grant this role.
3. The invitee receives an email with an invitation link. They must sign into the app with
   the matching Supabase account before the invitation is accepted.
4. After accepting, they gain their `PlatformRole`. They still need to enrol a device
   (see §7) before they can pass layer 3.

---

## §7 — Enrol additional devices via the UI

Once you have a valid `AdminSession`, navigate to `/admin/admin-devices`:

1. Click **Enrol new device**.
2. Paste the contents of the new `*.pub` file (OpenSSH `ssh-ed25519` format only).
3. Enter a descriptive label (e.g. `Work MacBook Pro — Touch ID`).
4. Submit.

To revoke a device, click **Revoke** next to it. Revoking immediately invalidates all
`AdminSession`s that were issued using that device.

---

## §8 — Verification checklist

After setup, confirm the following:

- [ ] `/admin` redirects to `/admin/verify` when no `AdminSession` cookie is present.
- [ ] An incorrect signature on the challenge returns a 401 and logs an
  `admin_challenge_failed` audit event.
- [ ] After `ADMIN_MAX_FAILED_ATTEMPTS` failures, further challenge requests return 429
  for 10 minutes.
- [ ] Revoking a device logs out any open admin sessions tied to that device.
- [ ] Signing out via `/auth/sign-out` also revokes all `AdminSession`s for the user.
- [ ] Audit events appear at `/admin/overview` and `/api/admin/audit-events`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Seed script: `No Supabase auth user found` | Operator has not signed up yet | Sign up first via `/sign-up`, then re-run the seed |
| `/admin` returns 403 immediately | `ADMIN_ENABLED` is not `true` | Set `ADMIN_ENABLED=true` in env and redeploy/restart |
| Challenge page throws on startup | `ADMIN_REQUIRE_DEVICE_KEY=false` in production | Set it to `true` in production env vars |
| "Too many failed attempts" (429) | `ADMIN_MAX_FAILED_ATTEMPTS` exceeded in the last 10 min | Wait 10 minutes, then retry; or reduce the failure count in the DB by deleting recent `admin_challenge_failed` audit events (use Supabase SQL editor) |
| Signature rejected despite correct key | Nonce expired | The challenge TTL (`ADMIN_CHALLENGE_TTL_SECONDS`) has passed; request a fresh challenge and sign within the window |
| Device ID not known | Seed script output did not include UUID | Query `admin_devices` table directly — see §4 |
| Hardware key signing fails | Wrong namespace | Ensure `-n paidsoon-admin` matches what the app expects; check `lib/admin/ssh.ts` for the namespace string |
