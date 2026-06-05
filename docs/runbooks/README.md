# PaidSoon — Operator Runbooks

These runbooks bring up PaidSoon end-to-end across three environments. Each runbook covers one external service in isolation; this README orchestrates them and is the single normative source for environment variables.

## Environments

| Name | Where it runs | Supabase project | Stripe mode | Resend sender | Cron |
|---|---|---|---|---|---|
| **Local** | `npm run dev` on your machine | `paidsoon-dev` | test | `onboarding@resend.dev` | manual `curl` only |
| **Vercel Preview** | every PR / preview deploy | `paidsoon-dev` (shared with Local) | test (shared) | `onboarding@resend.dev` | not scheduled — production only |
| **Production** | `paidsoon.com` on Vercel | `paidsoon-prod` | live | `billing@paidsoon.com` | daily 09:00 UTC (Vercel Cron) |

Two operating principles:

- **Previews share dev backends.** Local and Preview both point at `paidsoon-dev` (Supabase) and Stripe test mode. There is no per-PR webhook plumbing; previews are UI-only with respect to Stripe webhooks. See [stripe.md](./stripe.md) for the rationale.
- **Cron only runs in Production.** Vercel does not schedule cron jobs on preview deployments. See [vercel.md](./vercel.md) for how to trigger the cron manually for testing.

## Recommended execution order for a fresh environment

```
       1. Resend           ──┐
            (domain DNS,     │  These three can run in parallel.
             API key)        │  Stripe Connect approval (3.1 in stripe.md)
                             │  is async — submit it on day 1.
       2. Supabase         ──┤
            (project, DB,    │
             auth, RLS)      │
                             │
       3. Stripe           ──┘
            (mode, product, Connect, API keys)

                            ↓ (all secrets in hand)

       4. Vercel           ─── env vars, custom domain, deploy

                            ↓ (deployment URL exists)

       5. Stripe webhooks  ─── register endpoints pointing at the deploy
          (back to stripe.md)

                            ↓

       6. Verification     ─── run scripts/verify-rls.ts; manual smoke;
                                end-to-end test (requires Connect approval)
```

For a brand-new production setup, work through the runbooks in this order:

1. [resend.md](./resend.md) — start DNS verification first (slow record propagation).
2. [supabase.md](./supabase.md) — Supabase project and schema.
3. [stripe.md](./stripe.md) §1–§4 — Stripe Connect application (async), API keys, product.
4. [vercel.md](./vercel.md) — import the project, set env vars, deploy.
5. [stripe.md](./stripe.md) §5 onward — register webhooks against the deployed URL.
6. Post-deploy fixups — see the last section of [vercel.md](./vercel.md).
7. Verification — see the last section of [supabase.md](./supabase.md) and [vercel.md](./vercel.md).

For Local development only, run sections 1–3 against test mode / dev project, then `npm run dev`. See each runbook's "Local" column for the dev posture.

## Environment-variable matrix

This is the only place where env-var values are listed. Every runbook **references** this matrix rather than restating values. To change which value an environment uses, change this table and update Vercel / `.env.local` accordingly.

| Env var | Local (`.env.local`) | Vercel Preview | Vercel Production | Source runbook |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `paidsoon-dev` project URL | `paidsoon-dev` project URL | `paidsoon-prod` project URL | [supabase.md §3](./supabase.md) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `paidsoon-dev` `sb_publishable_…` | `paidsoon-dev` `sb_publishable_…` | `paidsoon-prod` `sb_publishable_…` | [supabase.md §3](./supabase.md) |
| `SUPABASE_SECRET_KEY` | `paidsoon-dev` `sb_secret_…` | `paidsoon-dev` `sb_secret_…` | `paidsoon-prod` `sb_secret_…` | [supabase.md §3](./supabase.md) |
| `DATABASE_URL` | `paidsoon-dev` `authenticator` pooler URL | `paidsoon-dev` `authenticator` pooler URL | `paidsoon-prod` `authenticator` pooler URL | [supabase.md §2](./supabase.md) |
| `DIRECT_URL` | `paidsoon-dev` `postgres` direct URL | `paidsoon-dev` `postgres` direct URL | `paidsoon-prod` `postgres` direct URL | [supabase.md §2](./supabase.md) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | the preview deployment URL (set per deploy if needed) | `https://paidsoon.com` | [vercel.md §2](./vercel.md) |
| `CRON_SECRET` | any `openssl rand -hex 32` | not required (cron does not fire) | `openssl rand -hex 32` | [vercel.md §5](./vercel.md) |
| `STRIPE_SECRET_KEY` | test `sk_test_…` | test `sk_test_…` | live `sk_live_…` | [stripe.md §2](./stripe.md) |
| `STRIPE_PRO_PRICE_ID` | test `price_…` | test `price_…` | live `price_…` | [stripe.md §3](./stripe.md) |
| `STRIPE_CONNECT_CLIENT_ID` | test `ca_…` | test `ca_…` | live `ca_…` | [stripe.md §4](./stripe.md) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe CLI `whsec_…` | not required (no webhook endpoint) | dashboard `whsec_…` (prod endpoint) | [stripe.md §5](./stripe.md) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe CLI `whsec_…` | not required (no webhook endpoint) | dashboard `whsec_…` (prod endpoint) | [stripe.md §6](./stripe.md) |
| `RESEND_API_KEY` | dev `re_…` | dev `re_…` | prod `re_…` | [resend.md §2](./resend.md) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `onboarding@resend.dev` | `billing@paidsoon.com` | [resend.md §3](./resend.md) |
| `RESEND_FROM_NAME` | `PaidSoon (dev)` | `PaidSoon (preview)` | `PaidSoon` | [resend.md §3](./resend.md) |

### Where each var is consumed in code

The matrix is exhaustive against the code as of June 2026. Every env var the app reads from `process.env` is in the table above. If you find a new `process.env.X` in code, add a row here.

| Env var | Read by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | [middleware.ts](../../middleware.ts), [lib/supabase/server.ts](../../lib/supabase/server.ts), [lib/supabase/client.ts](../../lib/supabase/client.ts), [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | [middleware.ts](../../middleware.ts), [lib/supabase/server.ts](../../lib/supabase/server.ts), [lib/supabase/client.ts](../../lib/supabase/client.ts) |
| `SUPABASE_SECRET_KEY` | [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts) (admin client for `auth.admin.getUserById`) |
| `DATABASE_URL` | [lib/db/admin.ts](../../lib/db/admin.ts) |
| `DIRECT_URL` | [prisma.config.ts](../../prisma.config.ts) (migrations only) |
| `NEXT_PUBLIC_APP_URL` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/billing/portal/route.ts](../../app/api/billing/portal/route.ts), [app/api/stripe/connect/authorize/route.ts](../../app/api/stripe/connect/authorize/route.ts), [app/api/stripe/connect/callback/route.ts](../../app/api/stripe/connect/callback/route.ts), [app/auth/sign-out/route.ts](../../app/auth/sign-out/route.ts) |
| `CRON_SECRET` | [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts) |
| `STRIPE_SECRET_KEY` | [lib/providers/stripe.ts](../../lib/providers/stripe.ts), [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/billing/portal/route.ts](../../app/api/billing/portal/route.ts), [app/api/stripe/connect/callback/route.ts](../../app/api/stripe/connect/callback/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_PRO_PRICE_ID` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts) |
| `STRIPE_CONNECT_CLIENT_ID` | [app/api/stripe/connect/authorize/route.ts](../../app/api/stripe/connect/authorize/route.ts) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | [app/api/webhooks/stripe-connect/route.ts](../../app/api/webhooks/stripe-connect/route.ts) |
| `RESEND_API_KEY` | [lib/email/send.ts](../../lib/email/send.ts), [app/api/settings/email/route.ts](../../app/api/settings/email/route.ts) |
| `RESEND_FROM_EMAIL` | [lib/email/send.ts](../../lib/email/send.ts), [app/dashboard/settings/email/page.tsx](../../app/dashboard/settings/email/page.tsx) |
| `RESEND_FROM_NAME` | [lib/email/send.ts](../../lib/email/send.ts) |

### Things you might expect but won't find

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — **not used.** The app does not run Stripe.js in the browser; checkout is server-driven via `stripe.checkout.sessions.create`. Do not set this variable.
- `SUPABASE_SERVICE_ROLE_KEY` — superseded by `SUPABASE_SECRET_KEY` (Supabase's newer `sb_secret_…` API-key naming). Do not set the old name.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — superseded by `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the newer `sb_publishable_…` key). Do not set the old name.
