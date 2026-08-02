---
applyTo: "**/vercel.json,**/next.config*,**/app/api/cron/**"
---

# Vercel Deployment Instructions — PaidSoon

## Deployment Platform

- PaidSoon is hosted on Vercel.
- The build command is `prisma generate && next build`. Do not remove `prisma generate`.
- Framework: Next.js 16.2.6 with App Router.
- `serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"]` is required in `next.config.ts` — do not remove.

## Environment Variable Rules

- All environment variables are documented in `docs/runbooks/README.md` (canonical env matrix).
- **Never hardcode** env var values. Reference via `process.env.VAR_NAME`.
- Public variables (sent to browser) must be prefixed `NEXT_PUBLIC_`.
- Server-only secrets must NOT have the `NEXT_PUBLIC_` prefix.
- When adding a new env var:
  1. Add it to `docs/runbooks/README.md` with Local/Preview/Production values.
  2. Add it to Vercel dashboard for all required environments.
  3. Never commit the actual value to any file.

### Required Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | Public | App base URL |
| `DATABASE_URL` | Server | Supabase Postgres pooler (pgBouncer) |
| `DIRECT_URL` | Server | Supabase Postgres direct (migrations only) |
| `SUPABASE_SECRET_KEY` | Server | Supabase admin key (cron/webhooks) |
| `RESEND_API_KEY` | Server | Resend transactional email |
| `RESEND_FROM_EMAIL` | Server | System "From" email domain |
| `RESEND_FROM_NAME` | Server | System "From" display name |
| `STRIPE_SECRET_KEY` | Server | Stripe API key (test or live) |
| `STRIPE_STARTER_PRICE_ID` | Server | Stripe price for Starter tier |
| `STRIPE_SOLO_PRICE_ID` | Server | Stripe price for Solo tier |
| `STRIPE_SMALL_BUSINESS_PRICE_ID` | Server | Stripe price for Small Business tier (`accountant_partner` is contact-us only, no Price ID) |
| `STRIPE_CONNECT_CLIENT_ID` | Server | Stripe Connect OAuth client ID |
| `STRIPE_BILLING_WEBHOOK_SECRET` | Server | Billing webhook signature secret |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Server | Connect webhook signature secret |
| `CRON_SECRET` | Server | Bearer token for cron authentication |
| `INTERNAL_JOBS_SECRET` | Server | Bearer token for Railway Celery worker \u2192 Next.js internal job calls |
| `RAILWAY_WORKER_URL` | Server | Railway worker base URL (optional \u2014 enables async "sync now"/"trigger now") |
| `WORKER_TRIGGER_SECRET` | Server | Bearer token for Next.js \u2192 Railway worker "trigger now" calls |
| `OPS_ALERT_EMAIL` | Server | Recipient for the scheduling-watchdog stale-heartbeat alert |
| `LIVE` | Server | `true` = enable sign-in/sign-up |

## Cron Job Rules

- Cron jobs are defined in `vercel.json`:
  ```json
  { "path": "/api/cron/send-emails", "schedule": "0 9 * * *" },
  { "path": "/api/cron/sync-accounting", "schedule": "0 2 * * *" },
  { "path": "/api/cron/scheduling-watchdog", "schedule": "0 12 * * *" }
  ```
- `send-emails` runs daily at 09:00 UTC, `sync-accounting` daily at 02:00 UTC.
- `scheduling-watchdog` runs daily at 12:00 UTC and alerts if the Railway Celery Beat dispatcher's heartbeat (see
  [migrate-scheduled-jobs-to-railway-celery](../../openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md))
  is stale — Vercel Hobby plan caps cron frequency at once daily, so this is the most frequent schedule available
  without upgrading to Pro.
- **Authentication:** The cron handler checks `Authorization: Bearer CRON_SECRET`. Never remove this check.
- Cron jobs must use `prismaAdmin` (RLS bypass is intentional — cron processes all users).
- Do not add additional cron jobs without updating `vercel.json` and documenting in `docs/DDD.md`.

## Preview Deployment Rules

- Preview deployments use non-production Stripe test keys and Supabase staging credentials.
- Set `LIVE=false` on preview deployments — this disables sign-in/sign-up pages (pre-launch gate).
- `DATABASE_URL` on preview must point to a preview/staging Supabase project, not production.
- Never run `npx prisma migrate deploy` against the production DB from a preview context.

## Production Deployment Rules

- `LIVE=true` in production enables sign-in/sign-up pages.
- Only Vercel CI/CD should run `prisma migrate deploy` against production.
- `DATABASE_URL` must use the pgBouncer pooled connection in production. Never use `DIRECT_URL` at runtime.
- Stripe live keys must only be set in the production Vercel environment.
- Review all env var changes in `docs/runbooks/README.md` before deploying.

## Edge/Runtime Considerations

- PaidSoon uses the default Node.js runtime for all routes (not Edge runtime).
- Prisma requires the Node.js runtime. Do not set `export const runtime = "edge"` in any route that uses Prisma.
- Supabase SSR cookie handling requires the Node.js runtime.

## Build Command Validation

- Before deploying, run `npm run build` locally to catch type errors and build failures.
- Verify `prisma generate` succeeds (requires `DATABASE_URL` or `DIRECT_URL` to be set).
- Run `npm run lint` to catch ESLint errors before deployment.
- Run `npm run test` to execute unit tests.
