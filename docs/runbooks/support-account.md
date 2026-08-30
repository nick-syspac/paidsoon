# Support Account Runbook — Syspac Pty Ltd

This runbook covers the internal support/owner account: the **Syspac Pty Ltd**
tenant used by the operator for support access, dogfooding, and platform
administration. It is a real product account with the full feature set, but it
never goes through Stripe billing.

## What this account is

| Property | Value |
|---|---|
| Login email | `nick@syspac.com.au` |
| Company (display name) | Syspac Pty Ltd |
| Subscription tier | `small_business` (full feature set) |
| Billing | None — no Stripe customer or subscription attached |
| Platform role | `platform_owner` (grants `/admin` support console access) |

There is no "free plan" flag in the codebase. Feature gating in
[lib/billing.ts](../../lib/billing.ts) keys off `UserProfile.subscriptionTier`
only — it never verifies a Stripe subscription exists at gate time. The seed
script therefore grants `small_business` + `active` directly and attaches no
Stripe identifiers. This is the intended, documented mechanism for internal
comp accounts — do not invent a `comped` flag.

Because there is no Stripe billing period, the chase-volume allowance falls
back to the current calendar month (`resolveAllowancePeriod` in
[lib/billing.ts](../../lib/billing.ts)), which is correct behaviour for an
internal account.

## Prerequisites

- The Supabase project is provisioned with schema + RLS applied
  ([supabase.md](./supabase.md)) and `verify-rls` passes.
- The operator has **signed up via the app** with `nick@syspac.com.au`. The
  seed script looks up an existing Supabase Auth user by email and fails
  otherwise — it does not create auth users.

## Seeding

Idempotent — safe to re-run at any time.

```bash
npm run seed:support-account
```

With the first admin SSH device enrolled in the same step:

```bash
ADMIN_SSH_PUBLIC_KEY="$(cat ~/.ssh/paidsoon_admin_ed25519.pub)" \
ADMIN_DEVICE_LABEL="Syspac MacBook" \
  npm run seed:support-account
```

Overrides (rarely needed):

| Env var | Default | Purpose |
|---|---|---|
| `SUPPORT_ACCOUNT_EMAIL` | `nick@syspac.com.au` | Login email of the account to promote |
| `SUPPORT_COMPANY_NAME` | `Syspac Pty Ltd` | `UserProfile.displayName` |
| `SUPPORT_ACCOUNT_TIER` | `small_business` | Tier to grant |
| `ADMIN_SSH_PUBLIC_KEY` | — | Optional first admin device |
| `ADMIN_DEVICE_LABEL` | `support-device` | Label for the enrolled device |

The script ([scripts/seed-support-account.ts](../../scripts/seed-support-account.ts))
upserts four things: `UserProfile` (tier + status + display name), the default
`Schedule` (3/10/21-day cadence, mirroring the post-signup bootstrap in
[lib/actions/auth.ts](../../lib/actions/auth.ts)), the `PlatformRole`
(`platform_owner`), and optionally the first `AdminDevice`.

After seeding, set the sender identity (`EmailSettings.fromName` → "Syspac Pty
Ltd", and a custom reply-to if desired) via **Dashboard → Settings → Email** —
sender identity is user-managed UI state, not seeded.

## Support usage

Sign in at the app with `nick@syspac.com.au`, then:

- **Product dashboard** (`/dashboard`) — the account behaves like any
  `small_business` tenant. Use it to reproduce customer-reported behaviour,
  validate email sequences, and dogfood new features against real data.
- **Admin console** (`/admin`) — requires `ADMIN_ENABLED=true` plus, in
  production, the SSH device challenge (`ADMIN_REQUIRE_DEVICE_KEY=true` —
  mandatory in production; the app refuses to boot otherwise). Enrol your
  device either at seed time (above) or via the admin UI. See
  [admin.md](./admin.md) for the challenge-response flow and
  [admin-touchid.md](./admin-touchid.md) for the Secure Enclave path.

Support operations available from the admin console include customer search,
tenant diagnostics (e.g. the trial-lapsed check), and the audit log. All admin
actions are attributed to this account in the audit trail.

## Environment scoping

Run the seed once per environment where the account should exist. Typically:

- **Local / Preview** (`paidsoon-dev`) — always; this is where support
  reproduction happens.
- **Production** (`paidsoon-prod`) — once, at provisioning time, so the
  operator can administer the live platform.

The account email is real — never use it in `seed-preview.ts`-style demo
fixtures, and never set `SEED_*` variables in production.

## Re-running / changing the tier

Re-running the script is a no-op when nothing changed. To change the tier
(e.g. test `solo` gating), either edit the account via the admin console or
run with `SUPPORT_ACCOUNT_TIER=solo`. Do not attach Stripe billing to this
account — a real subscription would start charging and would fight the
script's no-Stripe invariant on the next run.
