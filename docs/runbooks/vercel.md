# Vercel runbook

Vercel hosts the Next.js app and runs the daily cron. This runbook covers the project import, env-var configuration per Vercel environment, custom domain, cron schedule, and the post-deploy fixups that link Vercel back to Supabase and Stripe.

> Env-var values come from [README.md](./README.md) — set them in the environment named in each row.

**Prerequisites:**

- [supabase.md](./supabase.md) — both projects exist; you have all four URL/key values per project.
- [stripe.md](./stripe.md) §1–§4 — API keys and billing price IDs (`STRIPE_STARTER_PRICE_ID`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_SMALL_BUSINESS_PRICE_ID`) exist in both modes; `STRIPE_CONNECT_CLIENT_ID` exists at least in test mode (live mode requires Connect approval).
- [resend.md](./resend.md) — at minimum an API key (production domain verification can finish in parallel).

§5 and §6 here happen **after** the first deploy, because they reference the deployment URL.

---

## 1. Import the project

1. Push the repo to GitHub if you haven't.
2. [vercel.com/new](https://vercel.com/new) → **Import** your GitHub repo.
3. **Framework Preset**: Next.js (auto-detected).
4. **Root Directory**: leave as `/`.
5. **Build & Output Settings**: leave defaults.
6. **Do NOT click Deploy yet** — env vars first, otherwise the first build fails on missing variables.

---

## 2. Environment variables

Vercel has three environments (set per-var which apply):

| Vercel environment | Maps to | Notes |
|---|---|---|
| **Production** | the `main` branch deploy on `paidsoon.com` | gets the live Supabase project, live Stripe mode, paidsoon.com sender |
| **Preview** | every PR branch deploy | shares `paidsoon-dev` Supabase + Stripe test mode with Local |
| **Development** | only used by `vercel dev` (most teams ignore) | optional; if you don't use `vercel dev`, leave unchecked |

For every env var, **explicitly choose which environments it applies to**. Do not blanket-tick all three for `DATABASE_URL` — Production must point at `paidsoon-prod`, Preview must point at `paidsoon-dev`. Mixing them up is the easiest way to write production data from a preview deploy.

### 2.1 Set every variable from the matrix

Vercel → Project → **Settings → Environment Variables**. Add every row from the [matrix in README.md](./README.md#environment-variable-matrix), with the values for that environment. The full list, with which Vercel envs to tick:

| Env var | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ (prod) | ✓ (dev) | ✓ (dev) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ (prod) | ✓ (dev) | ✓ (dev) |
| `SUPABASE_SECRET_KEY` | ✓ (prod) | ✓ (dev) | ✓ (dev) |
| `DATABASE_URL` | ✓ (prod `authenticator` pooler) | ✓ (dev `authenticator` pooler) | ✓ (dev `authenticator` pooler) |
| `DIRECT_URL` | ✓ (prod direct) | ✓ (dev direct) | ✓ (dev direct) |
| `NEXT_PUBLIC_APP_URL` | ✓ (`https://paidsoon.com`) | ✓ (preview URL — see §2.2) | ✓ (your preference) |
| `CRON_SECRET` | ✓ (required) | — | — |
| `STRIPE_SECRET_KEY` | ✓ (`sk_live_…`) | ✓ (`sk_test_…`) | ✓ (`sk_test_…`) |
| `STRIPE_STARTER_PRICE_ID` | ✓ (live `price_…`) | ✓ (test `price_…`) | ✓ (test `price_…`) |
| `STRIPE_SOLO_PRICE_ID` | ✓ (live `price_…`) | ✓ (test `price_…`) | ✓ (test `price_…`) |
| `STRIPE_SMALL_BUSINESS_PRICE_ID` | ✓ (live `price_…`) | ✓ (test `price_…`) | ✓ (test `price_…`) |
| `STRIPE_PRO_PRICE_ID` | optional legacy Solo fallback | optional legacy Solo fallback | optional legacy Solo fallback |
| `STRIPE_CONNECT_CLIENT_ID` | ✓ (live `ca_…`) | ✓ (test `ca_…`) | ✓ (test `ca_…`) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | ✓ (dashboard `whsec_…`) | — | — |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | ✓ (dashboard `whsec_…`) | — | — |
| `RESEND_API_KEY` | ✓ (prod key) | ✓ (dev key) | ✓ (dev key) |
| `RESEND_FROM_EMAIL` | ✓ (`billing@paidsoon.com`) | ✓ (`onboarding@resend.dev`) | ✓ (`onboarding@resend.dev`) |
| `RESEND_FROM_NAME` | ✓ (`PaidSoon`) | ✓ (`PaidSoon (preview)`) | ✓ (`PaidSoon (dev)`) |

**Critical line**: `DATABASE_URL` and `SUPABASE_SECRET_KEY` on Preview must point at `paidsoon-dev`, **not** `paidsoon-prod`. Otherwise every preview build can read and write production data.

### 2.2 `NEXT_PUBLIC_APP_URL` on Preview

Preview URLs are different per PR. Two practical options:

- **Static value**: set to `https://paidsoon-preview.vercel.app` (your team's stable preview alias if you set one up in Settings → Domains). Simplest.
- **Per-deploy**: leave blank and rely on Vercel's own `VERCEL_URL` system variable; that requires a small code change to fall back to `https://${process.env.VERCEL_URL}`. Out of scope for this change.

Recommended: pick a stable string and use it; OAuth flows that round-trip through external services (Supabase, Stripe Connect) will be limited to that URL on previews anyway.

### 2.3 Mirror into `.env.local`

After Vercel is configured, mirror the **Development** (or Preview) values into your local `.env.local` so `npm run dev` works. Easiest way:

```bash
# Install Vercel CLI once
npm i -g vercel

# Link this repo to the Vercel project
vercel link

# Pull env vars for development into .env.local
vercel env pull .env.local --environment=development
```

`.env.local` is git-ignored. Never commit secrets.

---

## 3. Custom domain

Vercel → Project → **Settings → Domains** → **Add**: `paidsoon.com`.

Vercel will tell you which DNS records to add at your registrar. Typical setup:

- `paidsoon.com` (apex) → A record to Vercel's IP (Vercel will show the value).
- `www.paidsoon.com` → CNAME to `cname.vercel-dns.com`.

After DNS propagates (usually <10 min), Vercel will auto-provision the TLS certificate. The domain is then live and `NEXT_PUBLIC_APP_URL=https://paidsoon.com` matches reality.

---

## 4. Cron schedule

[vercel.json](../../vercel.json) declares:

```json
{
  "crons": [
    { "path": "/api/cron/send-emails", "schedule": "0 9 * * *" }
  ]
}
```

Vercel auto-detects this on import. Verify in **Settings → Cron Jobs** that the entry appears.

- **Schedule**: `0 9 * * *` → daily at 09:00 **UTC**.
- **Path**: `/api/cron/send-emails` — handled by [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts).
- **Auth**: the route checks `Authorization: Bearer $CRON_SECRET` and returns 401 otherwise. Vercel sets this header automatically for its own cron invocations using the `CRON_SECRET` env var you set in §2.

> **Cron does NOT fire on Preview deployments.** Vercel only schedules cron jobs against the Production deployment. To exercise the email path on a preview (or locally), use the manual trigger in §6 below.

---

## 5. `CRON_SECRET`

Generate a long random hex string and set it as `CRON_SECRET` in Vercel (Production only):

```bash
openssl rand -hex 32
```

Required on Production. Optional on Preview and Development — the cron does not run there, so the variable is unread. (Set it anyway in `.env.local` if you plan to use the manual trigger in §6.)

The value never appears in any client bundle; it is only read by [send-emails/route.ts L11](../../app/api/cron/send-emails/route.ts#L11).

---

## 6. Manually triggering the cron (testing)

The cron runs once a day in production. To test the email-sending path on demand from any environment:

```bash
# Production
curl -i https://paidsoon.com/api/cron/send-emails \
  -H "Authorization: Bearer $CRON_SECRET"

# Local (npm run dev running)
curl -i http://localhost:3000/api/cron/send-emails \
  -H "Authorization: Bearer $CRON_SECRET"

# Preview deploy
curl -i https://paidsoon-pr-42.vercel.app/api/cron/send-emails \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected response: `200` with JSON `{ ok: true, emailsSent, errors, processed }`.

Wrong / missing `CRON_SECRET` → `401 Unauthorized`.

This is the standard way to validate that env vars (Resend, Supabase, Stripe Connect) are all wired correctly end-to-end after a deploy.

---

## 7. First deploy

After §2 is complete (env vars set), trigger the deploy:

- Either push to `main` → auto-deploys to Production.
- Or in Vercel dashboard → **Deployments → Redeploy**.

First build takes a few minutes (TypeScript + Prisma client generation). If it fails, check the build log — almost always a missing env var. Add it in §2 and redeploy.

---

## 8. Post-deploy fixups

Once you have a working production URL, two external services need their config updated to reference it:

### 8.1 Supabase URL configuration

See [supabase.md §7.2](./supabase.md). Add the production URL to Site URL and Redirect URLs in Supabase Authentication → URL Configuration. This is required for the email-confirmation and Google OAuth callbacks to land on the production deploy.

### 8.2 Stripe webhooks

See [stripe.md §5](./stripe.md) and [stripe.md §6](./stripe.md). Register the two **live-mode** webhook endpoints against the production URL and capture both `whsec_…` secrets back into Vercel env vars (`STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`). Redeploy so the new env vars take effect.

### 8.3 Stripe Connect OAuth Redirect URI

See [stripe.md §4.3](./stripe.md). Confirm `https://paidsoon.com/api/stripe/connect/callback` is registered in Stripe Connect → Settings → Integration. (You should have done this earlier; verify now.)

---

## 9. Smoke test the production deploy

- Open `https://paidsoon.com` → loads.
- `https://paidsoon.com/sign-up` → sign up with email; confirm email arrives; lands on `/dashboard`.
- Open in a second private window with a different account → both accounts see only their own data (RLS).
- `/dashboard/settings/stripe` → click Connect → finishes OAuth → returns with `success=connected`.
- `/dashboard/settings/subscription` → click Upgrade → completes a live Stripe checkout (or use test mode if you're verifying before launch).
- Trigger the manual cron from §6; confirm `200` and `emailsSent`/`processed` increments.

For the full end-to-end flow (Connect → invoice → 3 emails → payment → sequence stops), see the end-to-end test plan, which depends on Stripe Connect approval.

---

## 10. Wipe and re-run

- **Re-importing the Vercel project** loses env vars. Save them somewhere first (`vercel env pull` per environment).
- **Rotating `CRON_SECRET`**: change in Vercel, redeploy; the next cron invocation uses the new value. No coordination with external services needed.
- **Removing the custom domain**: remove from Vercel → Settings → Domains; the deploy stays reachable at its `*.vercel.app` URL. Update `NEXT_PUBLIC_APP_URL` and post-deploy fixups (§8) accordingly.
