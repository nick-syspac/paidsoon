# Admin Setup Runbook (Touch ID)

This runbook bootstraps a PaidSoon platform admin user using macOS Touch ID for
private-key unlock during admin challenge signing.

Use this runbook when you want the production-recommended admin authentication path.
For the general admin runbook (software keys and mixed modes), see [admin.md](./admin.md).

---

## Prerequisites

- macOS device with Touch ID enabled for your user account.
- Built-in macOS OpenSSH (`/usr/bin/ssh-keygen`) for the default Touch ID flow.
- Optional: Homebrew OpenSSH if you want to use `ecdsa-sk` with an external
  FIDO authenticator (`brew install openssh`).
- Supabase project, schema, and RLS policies already applied
  ([supabase.md](./supabase.md)).
- App running locally or deployed ([vercel.md](./vercel.md)).
- You have already created your Supabase Auth account in the app using the email
  that will become platform owner.

---

## 1. Generate a key for Touch ID unlock (recommended path)

Generate a standard OpenSSH key (supported by PaidSoon):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/paidsoon_admin_touchid -C "paidsoon-admin-touchid"
```

When prompted, set a passphrase.

Load it into the macOS agent/keychain path:

```bash
/usr/bin/ssh-add -K ~/.ssh/paidsoon_admin_touchid
```

If your macOS build prefers the long-form flag, this equivalent command also
works when supported:

```bash
/usr/bin/ssh-add --apple-use-keychain ~/.ssh/paidsoon_admin_touchid
```

Important: if your shell resolves `ssh-add` to Homebrew OpenSSH, the long-form
Apple flags are not available and you may see `illegal option -- -`.

Check which binary your shell uses:

```bash
command -v ssh-add
```

For this workflow, use `/usr/bin/ssh-add` explicitly.

Verify key type:

```bash
ssh-keygen -l -f ~/.ssh/paidsoon_admin_touchid.pub
```

PaidSoon supports `ssh-ed25519` and `ecdsa-sha2-nistp256` public keys.

### Optional: external hardware key (`ecdsa-sk`)

Use this only if you have a FIDO authenticator (for example, YubiKey). On your
machine this route previously failed because no provider/device was available.

```bash
/opt/homebrew/bin/ssh-keygen -t ecdsa-sk -w internal \
  -f ~/.ssh/paidsoon_admin_fido -C "paidsoon-admin-fido"
```

If this returns `Key enrollment failed: device not found`, no FIDO device is
available to OpenSSH.

---

## 2. Set admin environment variables

For production, ensure these are configured in Vercel:

```bash
ADMIN_ENABLED=true
ADMIN_REQUIRE_DEVICE_KEY=true
ADMIN_SESSION_TTL_MINUTES=60
ADMIN_CHALLENGE_TTL_SECONDS=120
ADMIN_MAX_FAILED_ATTEMPTS=5
```

For local testing, you can keep production-like behavior by setting the same values in
`.env.local` and restarting `npm run dev`.

Do not set `ADMIN_REQUIRE_DEVICE_KEY=false` for production.

---

## 3. Seed platform owner and enrol Touch ID key

Run the bootstrap script with the platform owner email and public key:

```bash
PLATFORM_OWNER_EMAIL=you@example.com \
ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/paidsoon_admin_touchid.pub)" \
ADMIN_DEVICE_LABEL="MacBook Touch ID" \
  node --import tsx scripts/seed-admin-owner.ts
```

If successful, you should see:

- `Found Supabase user: <uuid>`
- `Created platform_owner role.` (or role already exists)
- `Enrolled admin device: MacBook Touch ID (SHA256:...)`
- `Done.`

If you see `No Supabase auth user found`, sign in first through the app and rerun.

---

## 4. Retrieve the device ID (UUID)

The challenge page needs the device UUID, not the fingerprint.

Run in Supabase SQL editor:

```sql
SELECT id, label, public_key_fingerprint, status
FROM admin_devices
WHERE admin_user_id = (
  SELECT id FROM auth.users WHERE email = 'you@example.com'
);
```

Copy the `id` value for your Touch ID device.

---

## 5. Complete first admin login with Touch ID

1. Sign in at `/sign-in` with `PLATFORM_OWNER_EMAIL`.
2. Open `/admin`.
3. On `/admin/verify`, paste the device UUID and click Request challenge.
4. Copy the nonce shown in the UI.
5. Sign the nonce using your enrolled private key:

```bash
echo -n "<nonce>" | ssh-keygen -Y sign \
  -f ~/.ssh/paidsoon_admin_touchid \
  -n paidsoon-admin-auth \
  -q
```

1. Approve the Touch ID or keychain prompt (if shown).
2. Paste the full armoured signature (including BEGIN/END markers) into the Signature field.
3. Click Verify.

Expected result: redirect to `/admin/overview` with an active `admin_session` cookie.

---

## 6. Post-setup checks

- Verify `/admin` redirects to `/admin/verify` after admin session expiry.
- Verify one bad signature returns 401 and logs `admin_challenge_failed`.
- Verify revoking the enrolled device invalidates active admin sessions.
- Verify `/auth/sign-out` revokes all admin sessions for the user.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `No FIDO SecurityKeyProvider specified` | `ecdsa-sk` invoked on an OpenSSH build without configured provider | Use the recommended keychain flow (`ed25519` + `/usr/bin/ssh-add -K`), or install Homebrew OpenSSH and run `-w internal` with a real FIDO device |
| `provider ... is not an OpenSSH FIDO library` | `-w` points to `libfido2` or helper binary instead of an OpenSSH SK provider | Do not point `-w` at `libfido2.dylib` or `ssh-sk-helper`; use Homebrew `ssh-keygen` with `-w internal` |
| `Key enrollment failed: device not found` | No external FIDO authenticator detected | Connect/unlock a FIDO token, or use the keychain Touch ID flow instead |
| `ssh-add: illegal option -- -` | Homebrew `ssh-add` does not support Apple long flags | Run `/usr/bin/ssh-add -K ~/.ssh/paidsoon_admin_touchid` (or `/usr/bin/ssh-add --apple-use-keychain ...`) |
| Seed command exits with missing env vars | Canonical Supabase inputs or `SUPABASE_SECRET_KEY` not loaded | Confirm `.env.local` and rerun from repo root |
| Challenge verify fails with valid key | Wrong namespace | Ensure `-n paidsoon-admin-auth` is used exactly |
| Challenge verify fails after delay | Challenge expired | Request a fresh challenge and sign immediately |
| No Touch ID prompt appears while signing | Using the wrong private key file | Confirm `-f ~/.ssh/paidsoon_admin_touchid` points to the Touch ID key |

---

## Security notes

- Keep `ADMIN_REQUIRE_DEVICE_KEY=true` in production at all times.
- Do not share or export private key material.
- Revoke lost devices immediately from `/admin/admin-devices`.
- Keep admin session TTL short (60 minutes recommended in production).
