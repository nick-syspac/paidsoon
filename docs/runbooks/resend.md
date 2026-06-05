# Resend runbook

Resend sends the follow-up emails (stages 1, 2, 3) to the freelancer's clients. The only thing PaidSoon needs from Resend is a verified sending domain and an API key.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Prerequisites:** none for the dev path. Production needs control of the `paidsoon.com` DNS zone (your registrar).

---

## 1. Domain & DNS (production only)

For local development and Vercel preview, Resend's sandbox sender `onboarding@resend.dev` works without any DNS — skip ahead to §2 for those environments. The DNS work is only needed for the production sender `billing@paidsoon.com`.

### 1.1 Add the domain

1. [resend.com](https://resend.com) → sign up / sign in.
2. Dashboard → **Domains → Add Domain**.
3. Enter `paidsoon.com`.
4. Region: pick the one closest to your users (e.g. `us-east-1`); the region affects sender IP geography but not configuration.

### 1.2 Add the DNS records

Resend will show three records to add at your DNS registrar:

| Record type | Purpose |
|---|---|
| `TXT` (SPF) | Authorizes Resend's servers to send for `paidsoon.com` |
| `TXT` (DKIM) | Cryptographic signature key — proves emails actually came from your domain |
| `MX` or `CNAME` (Return-Path) | Where bounces and complaints are routed |

Copy each `Name` / `Value` pair Resend gives you and add them at your registrar. Records typically propagate in 5–30 minutes.

### 1.3 Wait for `Verified`

Refresh the Resend Domains page until status shows **Verified** for all three records. **Do not skip this gate** — sending from an unverified domain produces immediate bounces and damages your sender reputation.

If after an hour the records are still not verified, check:

- Did you copy the trailing `.` in the record name (or omit it, depending on what your registrar wants)?
- Is there a conflicting SPF record? You can only have one `v=spf1 …` record per domain.
- Is your domain using DNSSEC with stale signatures?

---

## 2. API key

Resend dashboard → **API Keys → Create API Key**.

- Name: `paidsoon-dev` or `paidsoon-prod` (one per environment so you can rotate independently).
- Permission: **Full access** (or just "Sending access" if you want to scope tighter).
- Copy the key (starts with `re_…`) **once** — it is never shown again.

Capture as `RESEND_API_KEY` per the matrix in [README.md](./README.md). Set the production key on Vercel Production, and the dev key on Vercel Preview / Development / your local `.env.local`.

The key is read by [lib/email/send.ts L8](../../lib/email/send.ts#L8) and [app/api/settings/email/route.ts L10](../../app/api/settings/email/route.ts#L10).

### 2.1 Local / Preview without a verified domain

For Local and Preview environments, use the sandbox sender — no domain verification required:

| Env var | Local / Preview value |
|---|---|
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` |
| `RESEND_FROM_NAME` | `PaidSoon (dev)` / `PaidSoon (preview)` |

Emails sent from `onboarding@resend.dev` are limited to your own verified Resend account email address as the **recipient** (Resend's sandbox restriction). That's fine for testing; production uses your real domain so any recipient is reachable.

---

## 3. Sender identity env vars

Three env vars set the `From:` header on outgoing emails. They're read together in [lib/email/send.ts L40](../../lib/email/send.ts#L40):

```ts
from: `${process.env.RESEND_FROM_NAME!} <${process.env.RESEND_FROM_EMAIL!}>`
```

Per the matrix in [README.md](./README.md):

| Env var | Local | Preview | Production |
|---|---|---|---|
| `RESEND_API_KEY` | dev `re_…` | dev `re_…` | prod `re_…` |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `onboarding@resend.dev` | `billing@paidsoon.com` |
| `RESEND_FROM_NAME` | `PaidSoon (dev)` | `PaidSoon (preview)` | `PaidSoon` |

The `(dev)` / `(preview)` suffix on `RESEND_FROM_NAME` is **highly recommended** — it makes test emails visually distinct in the inbox so you don't mistake them for production traffic.

`RESEND_FROM_EMAIL` is also displayed on [app/dashboard/settings/email/page.tsx L23](../../app/dashboard/settings/email/page.tsx#L23) as the fallback "From" address shown to Free-tier users in the Email Settings UI.

### 3.1 Pro-tier custom senders

Pro-tier users can configure their own `fromEmail` / `fromName` / `replyTo` in **Settings → Email**. That flow lives in [resolveFromAddress()](../../lib/email/send.ts) and uses Resend's domain-verification API per-user. It does **not** require any additional env vars — the same `RESEND_API_KEY` is used to send on behalf of all users.

---

## 4. Verification

After both Resend and Vercel are configured:

- Send a test email by triggering the manual cron (see [vercel.md §6](./vercel.md)) against an environment with at least one overdue invoice.
- Check the Resend dashboard → **Logs**: the send should appear with no warnings.
- For Production, confirm the `From:` header reads `PaidSoon <billing@paidsoon.com>` (not the dev sandbox) and that SPF + DKIM both show ✓ in the message details.

---

## 5. Wipe and re-run

- **Rotating the API key**: create a new key in Resend, update Vercel + `.env.local`, delete the old key. No downtime if you keep the old key alive for a few seconds during the swap.
- **Re-verifying the domain**: only needed if DNS records are accidentally deleted at the registrar. Re-add them and wait for Verified status.
- **Switching domains** (e.g. `paidsoon.com` → `paidsoon.app`): repeat §1 for the new domain, change `RESEND_FROM_EMAIL` in Vercel Production, redeploy. The old domain can be removed once no scheduled emails reference it.
