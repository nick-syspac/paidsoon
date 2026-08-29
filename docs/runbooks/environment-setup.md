# Environment Setup Runbook — Vercel, Supabase, Railway

A per-subsystem checklist of every environment variable PaidSoon needs, where to
obtain each value, and the order in which to configure the subsystems.

> **Canonical values:** per-environment values (Local / Preview / Production) live in
> the [env-var matrix](./README.md#environment-variable-matrix) and the
> [Railway matrix](./README.md#railway-environment-variable-matrix) in
> [README.md](./README.md). This runbook tells you *which subsystem gets which
> variable* and *where the value comes from* — it does not restate values. Never
> paste real secrets into docs.

## Setup order

Configure subsystems in this order. Steps 1–2 produce values the others consume;
step 4 needs the Vercel URL from step 3.

```
1. Supabase          ── produces project ref, DB password, API keys
2. (parallel) Stripe, Resend, OpenAI, Cloudflare Turnstile, Xero/MYOB
                     ── produce API keys, price IDs, webhook secrets
3. Vercel            ── consumes everything above; produces the deployment URL
4. Railway           ── consumes Vercel URL + shared secrets; produces worker URL
5. Back to Vercel    ── set RAILWAY_WORKER_URL now that it exists
6. Webhooks          ── register Stripe/Resend webhook endpoints against the
                        deployed URL (these generate their own secrets to set)
```

Webhook secrets (`STRIPE_BILLING_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`,
`RESEND_WEBHOOK_SECRET`) can only be obtained *after* the endpoint is registered
against a live URL, so they are always configured last within their subsystem.

---

## 1. Supabase

Supabase needs no env vars *on* Supabase — it is the **source** of values every
other subsystem consumes. Obtain these from the Supabase dashboard
(`https://supabase.com/dashboard/project/<ref>`):

| Value | Where in Supabase | Consumed by |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID (also visible in the project URL) | Vercel, Railway, local `.env.local` |
| `SUPABASE_DB_PASSWORD` | Set at project creation; reset via Project Settings → Database → Database password | Vercel, Railway, local. Server-only secret. |
| `SUPABASE_DB_POOLER_HOST` | Project Settings → Database → Connect panel (shared pooler host) | Optional override everywhere; omit if it matches the documented default |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → `sb_publishable_…` key | Vercel (public; safe for browser) |
| `SUPABASE_SECRET_KEY` | Project Settings → API → `sb_secret_…` key | Vercel, local. Server-only secret. |

After the project exists: apply the schema (`npm run prisma:migrate:deploy`),
apply RLS policies (`prisma/rls-policies.sql`), and verify with
`npm run verify-rls`. See [supabase.md](./supabase.md).

## 2. Parallel third-party services

These are independent of each other. Start them while Supabase settles.

### Stripe — [stripe.md](./stripe.md)

| Variable | Where to get the value |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (`sk_test_…` / `sk_live_…`) |
| `STRIPE_STARTER_PRICE_ID` | Stripe Dashboard → Product catalog → Starter price (`price_…`). Must have `tax_behavior: "inclusive"`. |
| `STRIPE_SOLO_PRICE_ID` | Product catalog → Solo price |
| `STRIPE_SMALL_BUSINESS_PRICE_ID` | Product catalog → Small Business price |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Dashboard → Connect → Settings (`ca_…`). Connect approval is async — submit on day 1. |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Created in step 6: Developers → Webhooks → add endpoint → signing secret (`whsec_…`). Local: `stripe listen` CLI output. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Same flow, Connect webhook endpoint |

### Resend — [resend.md](./resend.md)

| Variable | Where to get the value |
|---|---|
| `RESEND_API_KEY` | Resend Dashboard → API Keys → create (`re_…`) |
| `RESEND_FROM_EMAIL` | Your verified sending domain (e.g. `billing@paidsoon.com`); `onboarding@resend.dev` for dev |
| `RESEND_FROM_NAME` | Display name; no external source |
| `RESEND_WEBHOOK_SECRET` | Created in step 6: Resend Dashboard → Webhooks → add endpoint → signing secret |

Start domain DNS verification first — propagation is the slowest step.

### OpenAI — [openai.md](./openai.md)

| Variable | Where to get the value |
|---|---|
| `OPENAI_API_KEY` | OpenAI platform → API keys (`sk-proj-…`) |

### Cloudflare Turnstile

| Variable | Where to get the value |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare dashboard → Turnstile → site (public). Use the always-passing test key in dev/preview. |
| `TURNSTILE_SECRET_KEY` | Same widget → secret key. Server-only. |

### Accounting integrations — [myob.md](./myob.md)

| Variable | Where to get the value |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Generate locally: `openssl rand -hex 32`. Server-only; never share with Xero/MYOB. |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | [Xero developer portal](https://developer.xero.com/app/manage) |
| `XERO_REDIRECT_URI` | Your app URL + `/api/integrations/xero/callback`; must be registered in the Xero portal |
| `MYOB_CLIENT_ID` / `MYOB_CLIENT_SECRET` | [MYOB developer portal](https://developer.myob.com) |
| `MYOB_REDIRECT_URI` | Your app URL + `/api/integrations/myob/callback`; must be registered in the MYOB portal |

## 3. Vercel

Vercel is the aggregation point — almost every value above lands here
(Project Settings → Environment Variables). Set per-environment values per the
[matrix](./README.md#environment-variable-matrix).

### Core app config

| Variable | Source | Scope |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Supabase (step 1) | server |
| `SUPABASE_DB_PASSWORD` | Supabase (step 1) | server, secret |
| `SUPABASE_DB_POOLER_HOST` | Supabase Connect panel (optional) | server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase (step 1) | public |
| `SUPABASE_SECRET_KEY` | Supabase (step 1) | server, secret |
| `NEXT_PUBLIC_APP_URL` | The deployment's own URL (`https://paidsoon.com` in prod) | public |
| `LIVE` | `false` pre-launch; `true` at go-live | server |
| `DEBUG` | `false` by default; `true` only for time-boxed diagnostics | server |

### Generated secrets (you create these)

Generate each with `openssl rand -hex 32`:

| Variable | Must match |
|---|---|
| `CRON_SECRET` | Nothing — authenticates Vercel Cron → `app/api/cron/*` |
| `INTERNAL_JOBS_SECRET` | The same value on Railway (step 4) |
| `WORKER_TRIGGER_SECRET` | The same value on Railway (step 4) |
| `TOKEN_ENCRYPTION_KEY` | Nothing — encrypts accounting tokens at rest |

### Values from step 2

All Stripe, Resend, OpenAI, Turnstile, Xero, and MYOB variables listed above.

### Railway-related (set in step 5, after Railway exists)

| Variable | Source |
|---|---|
| `RAILWAY_WORKER_URL` | The Railway `paidsoon-trigger-web` service's public URL. Optional — when unset, "sync now" runs inline on Vercel. |
| `DISPATCH_INTERVAL_SECONDS` | Must equal the Railway Beat value (default `120`) so the watchdog threshold matches |
| `STALE_THRESHOLD_MULTIPLIER` | `10` — watchdog staleness = interval × multiplier |
| `OPS_ALERT_EMAIL` | Recipient for the scheduling-stopped alert |

### Admin / seed / import (environment-specific — see matrix)

`ADMIN_ENABLED`, `ADMIN_REQUIRE_DEVICE_KEY`, `ADMIN_REQUIRE_MFA`,
`ADMIN_SESSION_TTL_MINUTES`, `ADMIN_CHALLENGE_TTL_SECONDS`,
`ADMIN_MAX_FAILED_ATTEMPTS`, `SEED_*` (never in production),
`TRAINING_IMPORT_*` (write window only), `NEXT_PUBLIC_COMPANY_ABN`.

Deploy after setting these: build command is `prisma generate && next build`.
See [vercel.md](./vercel.md).

## 4. Railway

Provision **four** services in one Railway project: `Redis` (plugin),
`paidsoon-worker`, `paidsoon-beat`, `paidsoon-trigger-web`. All three Python
services share the same variable set — set every row below on all three unless
noted. See [railway.md](./railway.md) and [worker/README.md](../../worker/README.md).

| Variable | Source |
|---|---|
| `REDIS_URL` | Railway Redis plugin → Variables → reference as `${{ Redis.REDIS_URL }}` |
| `SUPABASE_PROJECT_REF` | Supabase (step 1) — same value as Vercel |
| `SUPABASE_DB_PASSWORD` | Supabase (step 1) — secret |
| `SUPABASE_DB_POOLER_HOST` | Supabase Connect panel (optional override) |
| `INTERNAL_JOBS_SECRET` | **Copy the exact value you set on Vercel** |
| `PAIDSOON_APP_URL` | The Vercel deployment URL from step 3 (`https://paidsoon.com` in prod) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → Project Settings → Deployment Protection → Protection Bypass for Automation. Only if the target deployment is protected. |
| `WORKER_TRIGGER_SECRET` | **Copy the exact value you set on Vercel** |
| `DISPATCHER_NAME` | `celery-beat` (default; only change if running multiple named dispatchers) |
| `DISPATCH_INTERVAL_SECONDS` | `120` — **must equal the Vercel value** |
| `DISPATCH_REMINDER_INTERVAL_SECONDS` | Unset = inherits `DISPATCH_INTERVAL_SECONDS` |
| `DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS` | Unset = inherits |
| `DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS` | Unset = inherits |
| `DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS` | Unset = inherits |
| `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS` | Unset = inherits; floored at `300` |
| `STALE_PROCESSING_THRESHOLD_SECONDS` | `600` — when a `processing` claim is considered abandoned |
| `MAX_TASK_RETRIES` | `5` — retry cap for provider-calling tasks |
| `RETRY_BACKOFF_BASE_SECONDS` | `30` — initial exponential backoff |
| `PORT` | **Do not set** — Railway injects it for the web service; the start command uses `${PORT:-8000}` |

Start commands per service (root directory `/worker`, config
`/worker/railway.toml`):

```bash
# paidsoon-worker
celery -A paidsoon_worker.celery_app worker --loglevel=info --concurrency=4
# paidsoon-beat — deploy exactly one instance
celery -A paidsoon_worker.celery_app beat --loglevel=info
# paidsoon-trigger-web
uvicorn paidsoon_worker.http_server:app --host 0.0.0.0 --port ${PORT:-8000}
```

## 5. Close the loop back on Vercel

Once `paidsoon-trigger-web` has a public URL:

1. Set `RAILWAY_WORKER_URL` on Vercel to that URL.
2. Confirm `INTERNAL_JOBS_SECRET`, `WORKER_TRIGGER_SECRET`, and
   `DISPATCH_INTERVAL_SECONDS` are identical on both sides.
3. Redeploy Vercel so the new env var takes effect.

## 6. Register webhooks (final step)

Webhooks need the live deployment URL, so they come last:

1. Stripe Dashboard → Developers → Webhooks → add the billing and Connect
   endpoints → copy each signing secret into `STRIPE_BILLING_WEBHOOK_SECRET` and
   `STRIPE_CONNECT_WEBHOOK_SECRET` on Vercel.
2. Resend Dashboard → Webhooks → add the delivery-event endpoint → copy the
   signing secret into `RESEND_WEBHOOK_SECRET` on Vercel.
3. Redeploy Vercel once more, then run verification: `npm run verify-rls`,
   manual smoke test, and an end-to-end Connect flow (requires Stripe Connect
   approval from step 2).
