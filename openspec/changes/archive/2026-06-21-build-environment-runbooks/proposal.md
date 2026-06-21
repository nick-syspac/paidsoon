## Why

The two existing operator docs — [docs/SETUP.md](../../../docs/SETUP.md) (local-flavored full walkthrough) and [docs/GO-LIVE.md](../../../docs/GO-LIVE.md) (production checklist) — have drifted from the code in nine concrete places (wrong env var names, wrong Supabase API key naming, wrong webhook event names, missing Google OAuth, etc.). They also conflate "stand up one service" with "stand up the whole environment," which makes it hard to re-run any single provider in isolation or to bring up a Vercel Preview environment that shares the dev backend.

This change replaces them with per-service runbooks (Vercel, Supabase, Stripe, Resend) plus a top-level env-var matrix. Three environments are supported: local development, Vercel Preview (sharing the dev Supabase project and Stripe test mode), and production. Drift items are resolved against the code as ground truth.

## What Changes

- **NEW** `docs/runbooks/README.md` — index plus the canonical env-var matrix (env var × environment × source).
- **NEW** `docs/runbooks/supabase.md` — project creation, two-URL Postgres setup with the `authenticator` role (username-swap method), migrations, RLS policies + verification, Email + Google OAuth provider configuration, URL configuration for all three environments.
- **NEW** `docs/runbooks/stripe.md` — test vs live mode posture, PaidSoon Pro product, API keys, Stripe Connect platform application, two webhook endpoints (`stripe-billing` and `stripe-connect`) with the correct event lists, Stripe CLI for local development.
- **NEW** `docs/runbooks/vercel.md` — project import, env vars per Vercel environment (Production / Preview / Development), custom domain, cron schedule, the "cron only fires in production" caveat.
- **NEW** `docs/runbooks/resend.md` — domain verification (SPF / DKIM), API key, sender identity, dev sandbox vs production sender.
- **BREAKING (docs only)** Delete `docs/SETUP.md` and `docs/GO-LIVE.md`. The runbooks become the single source of truth.
- **Drift resolutions** baked into the new runbooks (code is ground truth):
  - Supabase publishable key var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `…_ANON_KEY`).
  - Supabase secret key var is `SUPABASE_SECRET_KEY` (not `SUPABASE_SERVICE_ROLE_KEY`).
  - App base URL var is `NEXT_PUBLIC_APP_URL` (not `NEXT_PUBLIC_URL`).
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not used anywhere — drop it from the runbook.
  - Google OAuth is wired in code and must be enabled in Supabase.
  - Stripe Connect webhook events are `invoice.overdue` + `invoice.paid` (only).
  - `authenticator` role is reached by swapping the username in the pooler URL while reusing the project DB password.
  - Cron does not fire on Vercel Preview deployments — explicitly noted.
- **Preview posture**: Previews are UI-only with respect to Stripe webhooks. No per-PR webhook plumbing; the Stripe CLI is used locally.
- **Follow-up captured (not in this change)**: `invoice.payment_failed` is listed in the Stripe Billing runbook as a required event so operators subscribe to it, but the code does not yet handle it. A separate change (`handle-billing-payment-failed-webhook`) is the right place to add the handler.

## Capabilities

### New Capabilities

None. This change is documentation only.

### Modified Capabilities

None. No application requirements change.

## Impact

- **Files added**: `docs/runbooks/README.md`, `docs/runbooks/supabase.md`, `docs/runbooks/stripe.md`, `docs/runbooks/vercel.md`, `docs/runbooks/resend.md`.
- **Files removed**: `docs/SETUP.md`, `docs/GO-LIVE.md`.
- **No code changes.** No env vars added or removed. No runtime behavior changes.
- **Operator-facing impact**: Anyone following the old docs will get redirected via README — recommend updating the repo `README.md` to point at `docs/runbooks/`.
- **Follow-up surface**: One new change to be filed separately for `invoice.payment_failed` handling.
