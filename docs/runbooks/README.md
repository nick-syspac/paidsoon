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
3. [stripe.md](./stripe.md) §1–§4 — Stripe Connect application (async), API keys, billing products.
4. [vercel.md](./vercel.md) — import the project, set env vars, deploy.
5. [stripe.md](./stripe.md) §5 onward — register webhooks against the deployed URL.
6. Post-deploy fixups — see the last section of [vercel.md](./vercel.md).
7. OpenAI — [openai.md](./openai.md) §1 (API key setup + DB migration for usage logs).
8. Admin — [admin.md](./admin.md) — bootstrap the first platform owner, SSH key setup, and first login.
9. Verification — see the last section of [supabase.md](./supabase.md) and [vercel.md](./vercel.md).
10. Accounting integrations — [myob.md](./myob.md) for MYOB Business setup and validation per environment (Xero setup is not yet documented in a dedicated runbook).
11. MYOB sandbox QA gate (OpenSpec task 15.7) — [myob-sandbox-verification.md](./myob-sandbox-verification.md) for pre-archive verification and evidence capture.

For launch readiness review and final go/no-go criteria, use:

- [go-live-decision-matrix.md](./go-live-decision-matrix.md) — operator decision matrix with owner, ETA, and evidence fields.

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
| `NEXT_PUBLIC_APP_URL` | `http://localhost:4001` (per `package.json`'s `next dev --port 4001`) | the preview deployment URL (set per deploy if needed) | `https://paidsoon.com` | [vercel.md §2](./vercel.md) |
| `LIVE` | `false` while pre-launch, `true` at go-live | `false` until launch readiness | `true` once publicly launched | [vercel.md §2](./vercel.md) |
| `CRON_SECRET` | any `openssl rand -hex 32` | not required (cron does not fire) | `openssl rand -hex 32` | [vercel.md §5](./vercel.md) |
| `STRIPE_SECRET_KEY` | test `sk_test_…` | test `sk_test_…` | live `sk_live_…` | [stripe.md §2](./stripe.md) |
| `STRIPE_STARTER_PRICE_ID` | test `price_…` | test `price_…` | live `price_…` | [stripe.md §3](./stripe.md) |
| `STRIPE_SOLO_PRICE_ID` | test `price_…` | test `price_…` | live `price_…` | [stripe.md §3](./stripe.md) |
| `STRIPE_SMALL_BUSINESS_PRICE_ID` | test `price_…` | test `price_…` | live `price_…` | [stripe.md §3](./stripe.md) |
| `STRIPE_PRO_PRICE_ID` | optional legacy fallback for Solo | optional legacy fallback for Solo | optional legacy fallback for Solo | [stripe.md §3](./stripe.md) |
| `STRIPE_CONNECT_CLIENT_ID` | test `ca_…` | test `ca_…` | live `ca_…` | [stripe.md §4](./stripe.md) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Stripe CLI `whsec_…` | not required (no webhook endpoint) | dashboard `whsec_…` (prod endpoint) | [stripe.md §5](./stripe.md) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe CLI `whsec_…` | not required (no webhook endpoint) | dashboard `whsec_…` (prod endpoint) | [stripe.md §6](./stripe.md) |
| `RESEND_API_KEY` | dev `re_…` | dev `re_…` | prod `re_…` | [resend.md §2](./resend.md) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | `onboarding@resend.dev` | `billing@paidsoon.com` | [resend.md §3](./resend.md) |
| `RESEND_FROM_NAME` | `PaidSoon (dev)` | `PaidSoon (preview)` | `PaidSoon` | [resend.md §3](./resend.md) |
| `OPENAI_API_KEY` | dev `sk-proj-…` | dev `sk-proj-…` | prod `sk-proj-…` | [openai.md §1](./openai.md) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 hex chars) | `openssl rand -hex 32` | `openssl rand -hex 32` | Server-side only — never expose to Xero/MYOB, the frontend, or logs. See [myob.md §2](./myob.md) |
| `XERO_CLIENT_ID` | Xero developer app client ID | same | same | From [Xero developer portal](https://developer.xero.com/app/manage) |
| `XERO_CLIENT_SECRET` | Xero developer app client secret | same | same | From [Xero developer portal](https://developer.xero.com/app/manage) — server-side only |
| `XERO_REDIRECT_URI` | `http://localhost:4001/api/integrations/xero/callback` | preview deployment URL + `/api/integrations/xero/callback` | `https://paidsoon.com/api/integrations/xero/callback` | Must be registered in Xero developer portal |
| `MYOB_CLIENT_ID` | MYOB developer app API key | same | same | [myob.md §1–2](./myob.md) — from [MYOB developer portal](https://developer.myob.com) |
| `MYOB_CLIENT_SECRET` | MYOB developer app API secret | same | same | [myob.md §1–2](./myob.md) — server-side only |
| `MYOB_REDIRECT_URI` | `http://localhost:4001/api/integrations/myob/callback` | preview deployment URL + `/api/integrations/myob/callback` | `https://paidsoon.com/api/integrations/myob/callback` | [myob.md §1](./myob.md) — must be registered in MYOB developer portal |
| `SEED_ENV` | `local` | `preview` | — (never set in production) | [preview-seed-data.md](../preview-seed-data.md) |
| `NEXT_PUBLIC_COMPANY_ABN` | omit or set to company ABN | omit or set to company ABN | ABN of Syspac Pty Ltd (e.g., `12 345 678 901`) | [MarketingFooter](../../components/marketing/MarketingFooter.tsx) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (CF test key — always passes) | `1x00000000000000000000AA` (CF test key) | real site key from [Cloudflare Turnstile dashboard](https://dash.cloudflare.com/) | [cloudflare-turnstile-auth change](../../openspec/changes/cloudflare-turnstile-auth/proposal.md) |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` (CF test secret) | `1x0000000000000000000000000000000AA` (CF test secret) | real secret key from Cloudflare Turnstile dashboard | [cloudflare-turnstile-auth change](../../openspec/changes/cloudflare-turnstile-auth/proposal.md) |
| `ADMIN_ENABLED` | `false` | `false` | `true` (set explicitly to enable the `/admin` routes) | [docs/admin-security.md](../admin-security.md) — if unset the platform admin UI is inaccessible |
| `ADMIN_REQUIRE_DEVICE_KEY` | `false` (dev convenience) | `false` | **`true`** — must be `true` in production; enforces SSH key challenge before issuing an AdminSession | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_REQUIRE_MFA` | `false` | `false` | `true` — reserved for future TOTP second-factor enforcement | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_SESSION_TTL_MINUTES` | `480` (8 h) | `480` | `60` (1 h) — how long an AdminSession cookie remains valid | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_CHALLENGE_TTL_SECONDS` | `300` | `300` | `120` — window in which a signed SSH challenge must be submitted | [app/api/admin/challenges/route.ts](../../app/api/admin/challenges/route.ts) |
| `ADMIN_MAX_FAILED_ATTEMPTS` | `10` | `10` | `5` — failed challenge attempts before temporary lockout | [app/api/admin/challenges/route.ts](../../app/api/admin/challenges/route.ts) |
| `PLATFORM_OWNER_EMAIL` | Supabase user email of first platform owner | — | Supabase user email of first platform owner | [scripts/seed-admin-owner.ts](../../scripts/seed-admin-owner.ts) — seed script only; never read at runtime |
| `ADMIN_SSH_PUBLIC_KEY` | contents of `~/.ssh/id_ed25519.pub` (optional device enrol) | — | contents of operator public key (optional first-device enrol) | [scripts/seed-admin-owner.ts](../../scripts/seed-admin-owner.ts) — seed script only; server never stores or uses the private key |

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
| `LIVE` | [lib/liveMode.ts](../../lib/liveMode.ts), [middleware.ts](../../middleware.ts), [app/layout.tsx](../../app/layout.tsx) |
| `CRON_SECRET` | [app/api/cron/send-emails/route.ts](../../app/api/cron/send-emails/route.ts) |
| `STRIPE_SECRET_KEY` | [lib/providers/stripe.ts](../../lib/providers/stripe.ts), [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/billing/portal/route.ts](../../app/api/billing/portal/route.ts), [app/api/stripe/connect/callback/route.ts](../../app/api/stripe/connect/callback/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_STARTER_PRICE_ID` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_SOLO_PRICE_ID` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_SMALL_BUSINESS_PRICE_ID` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_PRO_PRICE_ID` | [app/api/billing/checkout/route.ts](../../app/api/billing/checkout/route.ts), [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) (legacy Solo fallback) |
| `STRIPE_CONNECT_CLIENT_ID` | [app/api/stripe/connect/authorize/route.ts](../../app/api/stripe/connect/authorize/route.ts) |
| `STRIPE_BILLING_WEBHOOK_SECRET` | [app/api/webhooks/stripe-billing/route.ts](../../app/api/webhooks/stripe-billing/route.ts) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | [app/api/webhooks/stripe-connect/route.ts](../../app/api/webhooks/stripe-connect/route.ts) |
| `RESEND_API_KEY` | [lib/email/send.ts](../../lib/email/send.ts), [app/api/settings/email/route.ts](../../app/api/settings/email/route.ts) |
| `RESEND_FROM_EMAIL` | [lib/email/send.ts](../../lib/email/send.ts), [app/dashboard/settings/email/page.tsx](../../app/dashboard/settings/email/page.tsx) |
| `RESEND_FROM_NAME` | [lib/email/send.ts](../../lib/email/send.ts) |
| `OPENAI_API_KEY` | `lib/email/ai-rewrite.ts` (to be created) — server-side only, never browser |
| `SEED_ENV` | [scripts/seed-preview.ts](../../scripts/seed-preview.ts) — environment safety gate; never used by the application itself |
| `NEXT_PUBLIC_COMPANY_ABN` | [components/marketing/MarketingFooter.tsx](../../components/marketing/MarketingFooter.tsx) — optional; footer shows placeholder if absent |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | [app/(auth)/sign-in/page.tsx](../../app/(auth)/sign-in/page.tsx), [app/(auth)/sign-up/page.tsx](../../app/(auth)/sign-up/page.tsx), [components/marketing/ContactForm.tsx](../../components/marketing/ContactForm.tsx) — widget site key (browser-safe) |
| `TURNSTILE_SECRET_KEY` | [lib/auth/verifyTurnstile.ts](../../lib/auth/verifyTurnstile.ts), [app/api/contact/route.ts](../../app/api/contact/route.ts) — server-side Siteverify API secret; never expose to browser |
| `TOKEN_ENCRYPTION_KEY` | [lib/providers/accounting/crypto.ts](../../lib/providers/accounting/crypto.ts) — AES-256-GCM key for encrypting OAuth tokens at rest; server-side only; never expose to browser |
| `XERO_CLIENT_ID` | [lib/providers/accounting/xero.ts](../../lib/providers/accounting/xero.ts), [app/api/integrations/xero/connect/route.ts](../../app/api/integrations/xero/connect/route.ts), [app/api/integrations/xero/callback/route.ts](../../app/api/integrations/xero/callback/route.ts) |
| `XERO_CLIENT_SECRET` | [lib/providers/accounting/xero.ts](../../lib/providers/accounting/xero.ts) — server-side only; never expose to browser |
| `XERO_REDIRECT_URI` | [app/api/integrations/xero/connect/route.ts](../../app/api/integrations/xero/connect/route.ts), [app/api/integrations/xero/callback/route.ts](../../app/api/integrations/xero/callback/route.ts) |
| `MYOB_CLIENT_ID` | [lib/providers/accounting/myob.ts](../../lib/providers/accounting/myob.ts), [app/api/integrations/myob/connect/route.ts](../../app/api/integrations/myob/connect/route.ts), [app/api/integrations/myob/callback/route.ts](../../app/api/integrations/myob/callback/route.ts) |
| `MYOB_CLIENT_SECRET` | [lib/providers/accounting/myob.ts](../../lib/providers/accounting/myob.ts) — server-side only; never expose to browser |
| `MYOB_REDIRECT_URI` | [app/api/integrations/myob/connect/route.ts](../../app/api/integrations/myob/connect/route.ts), [app/api/integrations/myob/callback/route.ts](../../app/api/integrations/myob/callback/route.ts) |
| `ADMIN_ENABLED` | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_REQUIRE_DEVICE_KEY` | [app/api/admin/challenges/[id]/verify/route.ts](../../app/api/admin/challenges/[id]/verify/route.ts) |
| `ADMIN_REQUIRE_MFA` | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_SESSION_TTL_MINUTES` | [lib/admin/guard.ts](../../lib/admin/guard.ts) |
| `ADMIN_CHALLENGE_TTL_SECONDS` | [app/api/admin/challenges/route.ts](../../app/api/admin/challenges/route.ts) |
| `ADMIN_MAX_FAILED_ATTEMPTS` | [app/api/admin/challenges/route.ts](../../app/api/admin/challenges/route.ts) |
| `PLATFORM_OWNER_EMAIL` | [scripts/seed-admin-owner.ts](../../scripts/seed-admin-owner.ts) — seed script only |
| `ADMIN_SSH_PUBLIC_KEY` | [scripts/seed-admin-owner.ts](../../scripts/seed-admin-owner.ts) — seed script only |

### Things you might expect but won't find

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — **not used.** The app does not run Stripe.js in the browser; checkout is server-driven via `stripe.checkout.sessions.create`. Do not set this variable.
- `SUPABASE_SERVICE_ROLE_KEY` — superseded by `SUPABASE_SECRET_KEY` (Supabase's newer `sb_secret_…` API-key naming). Do not set the old name.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — superseded by `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the newer `sb_publishable_…` key). Do not set the old name.
