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

`RESEND_FROM_EMAIL` is also displayed on [app/settings/email/page.tsx](../../app/settings/email/page.tsx) as the fallback "From" address shown to Essentials-tier users in the Email Settings UI.

### 3.1 Tier-gated custom senders

Business Control+ users can configure `replyTo` and `fromName`, and Small Business+ users can use a verified custom `fromEmail` domain in **Settings → Email**. That flow lives in [resolveFromAddress()](../../lib/email/send.ts) and uses Resend's domain-verification API per-user. It does **not** require any additional env vars — the same `RESEND_API_KEY` is used to send on behalf of all users.

---

## 4. Webhook signing secret

Resend delivers delivery-status events (delivered/bounced/complained) via a Svix-signed webhook to `POST /api/webhooks/resend` ([route.ts](../../app/api/webhooks/resend/route.ts)). The route verifies the signature before updating any `EmailLog` row.

1. Resend dashboard → **Webhooks → Add Endpoint**.
2. Endpoint URL: `https://<your-deployment-domain>/api/webhooks/resend`.
3. Events: select at least `email.delivered`, `email.bounced`, `email.complained`.
4. Copy the **Signing Secret** (starts with `whsec_…`) and capture it as `RESEND_WEBHOOK_SECRET` per the matrix in [README.md](./README.md).

Local development has no public endpoint for Resend to call; use the Resend dashboard's "Send test event" button against a tunnelled URL (e.g. `ngrok`) if you need to exercise the webhook locally, or rely on the route's unit tests instead.

---

## 5. Verification

After both Resend and Vercel are configured:

- Send a test email by triggering the manual cron (see [vercel.md §6](./vercel.md)) against an environment with at least one overdue invoice.
- Check the Resend dashboard → **Logs**: the send should appear with no warnings.
- For Production, confirm the `From:` header reads `PaidSoon <billing@paidsoon.com>` (not the dev sandbox) and that SPF + DKIM both show ✓ in the message details.

---

## 6. Wipe and re-run

- **Rotating the API key**: create a new key in Resend, update Vercel + `.env.local`, delete the old key. No downtime if you keep the old key alive for a few seconds during the swap.
- **Re-verifying the domain**: only needed if DNS records are accidentally deleted at the registrar. Re-add them and wait for Verified status.
- **Switching domains** (e.g. `paidsoon.com` → `paidsoon.app`): repeat §1 for the new domain, change `RESEND_FROM_EMAIL` in Vercel Production, redeploy. The old domain can be removed once no scheduled emails reference it.

---

## 7. Trial-access notifications — in progress, not rolled out

Runtime contact/template/transport/outbox services are present in the working
tree; this is not rollout approval or a live-send instruction. Pending
migrations/CHECKs/full RLS and isolated checks (3.8/3.9/9.3), tasks 5/6/8 and release
verification remain gates. See [admin §9](./admin.md#9--trial-access-operations--in-progress-not-rolled-out)
and the [release checklist](./vercel.md#12-trial-access-and-customer-billing-journal-release-gate).
Generic test-email instructions in §5 do not authorize trial notification sends.

### 7.1 Recipient, content and existing configuration

- `notify` defaults false: no outbox or send unless selected. Requested outbox
	creation commits with completed access/audit; delivery is attempted after
	commit through [the delivery service](../../lib/email/trialAccessDelivery.ts),
	never from a route or as a fake invoice reminder/`EmailLog`.
- Prefer the live, identity-consistent linked Stripe billing customer's valid
	email/name (`stripe_billing`). Verification means matching customer ID and no
	conflicting tenant metadata, **not** a claim Stripe verified inbox ownership.
	Missing/deleted/unreadable/invalid Stripe contact may use the same tenant's
	non-deleted Supabase owner email (`owner_fallback`), explicitly labeled with no
	invented name. Contact fallback does not prove billing eligibility. Never use
	debtor/Connect contacts, reminder `fromEmail`, sender name or reply-to.
- Snapshot contact is read-only. Before first dispatch persist recipient/name/
	provenance, then exact `from`, `to`, `subject`, `html`, `text` and stable
	`trial-access/<operationId>` key. Retries reuse frozen recipient/payload/key;
	changed contacts, sender/app URL settings or plan state cannot retarget mail.
- Sanitized copy includes applicable plan, UTC exclusive expiry and subscription
	link. Stripe-extension copy explains changed first-billing timing and unchanged
	plan, not waived future charges. Application-only copy explicitly leaves Stripe
	billing/charges unchanged. Revocation describes only grant removal and recorded
	independent remaining access. Internal reason, audit/provider IDs and keys are
	excluded from customer copy.
- Reuse `RESEND_API_KEY`, valid system `RESEND_FROM_EMAIL`, optional
	`RESEND_FROM_NAME` (default `PaidSoon`) and `NEXT_PUBLIC_APP_URL`. If app URL is
	unset, `VERCEL_URL` is used as an HTTPS hostname. Configured app URL must be an
	origin (root path), HTTPS except local HTTP, without credentials/query/fragment;
	link is `/settings/subscription`, not the marketing site URL.
	Existing Stripe billing credentials and `SUPABASE_SECRET_KEY` support contact
	reads. Use the [existing env matrix](./README.md#environment-variable-matrix),
	verified sender/domain and sandbox recipient restriction above. **No new secret
	or feature flag.** Existing `RESEND_WEBHOOK_SECRET` concerns the `EmailLog`
	webhook; it does not reconcile this outbox's unknown outcomes.

### 7.2 Delivery states and explicit retry

Access result and delivery are independent. Access remains `succeeded` even if
mail is failed/blocked/unknown. Immutable access `notificationStatus` records
`pending`/`not_requested`; optional confirmation `notification.status` reports the
post-commit attempt. Status GET returns current outbox `notificationStatus`.
Post-commit persistence failure can return a separate `notification.status: unknown`
without rewriting access; inspect stored status/evidence before any retry.

| Delivery state/evidence | Actual behavior and operator action |
| --- | --- |
| `not_requested` | No opt-in, no send; retry does not enable notification. |
| `pending` | Initial automatic attempt only; untouched contact/payload may initialize before dispatch. |
| `sending` | Durable 60-second lease/fence prevents concurrent sends. A live claim returns current status; lease expiry is uncertainty, not proof of non-send. |
| `sent` | Valid provider message ID persisted; retry is a no-op. Means Resend accepted the send, not proof of inbox delivery. |
| `failed` | Retry only when stored evidence is definitively unsent (`unsent/` plus allowlisted `invalid_payload`, `invalid_key`, `reserved_recipient`, `missing_configuration`, `provider_rejected`). Failed status alone is insufficient. |
| `unknown` | Possible prior acceptance: identical replay only while strictly before original `firstAttemptAt + 24 hours`, with valid frozen evidence and non-obsolete content. At equality or later, remain unknown (`provider_reconciliation_required`), blocked from sending pending provider investigation. Never claim exactly-once after key expiry. |
| `blocked` | No contact: `trial_notification_contact_unavailable`; no send and retry does not silently look up a new address. Configuration/render failure: `trial_notification_configuration_unavailable`; a proven-unsent, never-attempted row with frozen contact may render after config repair. Not every blocked row is automatically retryable. |
| `superseded` | Obsolete unsent notification is suppressed/no-op. Expired/revoked/replaced grants, changed Stripe binding/plan/expiry or changed remaining-access copy cannot send stale success mail. Obsolete unknown prior attempts stay `unknown` for investigation, not falsely declared unsent. |

Confirmed-unsent failures may retry even after 24 hours if still accurate, because
nonacceptance is proven; they reuse the same frozen payload/key and never reset
`firstAttemptAt`. Unknown prior acceptance cannot be made unsent by a later
rejection. Transport accepts `sent` only with valid message ID and no SDK error;
error-valued SDK responses are inspected. Only allowlisted name/status rejection
evidence is `not_sent`; idempotency conflicts, unclassified errors, timeouts and
malformed/contradictory responses remain uncertain. HTTP status alone is not proof.

User retry is POST `{}` to
`/api/admin/tenants/[id]/trial-access/operations/[operationId]/notification/retry`.
It requires original actor/**original session**, current owner authority and same
origin; fresh-session status/Stripe recovery permission does not extend to mail.
Success transport is 200 `{operationId,notification:{status}}`, including blocked/
failed/unknown outcomes, not 202/502 based on email state. Safe route projection
omits internal failure details. Inspect restricted delivery/audit evidence instead.
Claims/results append mandatory `trial_notification` audit with executor and phase;
initial acceptance/audit must commit before provider send. Automatic post-commit
execution does not retry failed/unknown rows; no scheduled notification retry or
provider reconciliation endpoint is introduced. Investigate late unknowns in
restricted provider logs; never edit recipients/evidence, reset attempts/keys or
repeat the access change to force another email. Any fresh communication needs
separately reviewed accurate intent, not a fabricated retarget action.
