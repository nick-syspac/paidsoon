---
mode: agent
description: Review PaidSoon for production readiness before a launch or major release.
---

# Production Readiness Review — PaidSoon

## Role
You are a senior platform engineer reviewing PaidSoon for production readiness.

## Goal
Assess whether PaidSoon is ready to go live or release a new version, checking all infrastructure, security, functionality, and documentation criteria.

## PaidSoon Context
Hosted on Vercel. Supabase Postgres for data. Stripe for billing and invoice source. Resend for email. Daily cron job. Pre-launch gate controlled by `LIVE` env var.

## Files to Inspect
- `vercel.json` — cron config
- `next.config.ts` — build config
- `proxy.ts` — LIVE mode gate
- `lib/liveMode.ts` — launch gate logic
- `app/api/cron/send-emails/route.ts` — cron handler
- `app/api/webhooks/stripe-billing/route.ts` — billing webhook
- `app/api/webhooks/stripe-connect/route.ts` — connect webhook
- `prisma/schema.prisma` — data model
- `prisma/rls-policies.sql` — RLS policies
- `docs/runbooks/README.md` — env var matrix
- `docs/DDD.md` — architecture docs

## Production Readiness Checklist

### Environment
- [ ] `LIVE=true` set in production Vercel environment
- [ ] All env vars from `docs/runbooks/README.md` set in Vercel
- [ ] Production uses Stripe **live** keys (not test keys)
- [ ] Canonical Supabase inputs are scoped to production through secret-manager interfaces
- [ ] Runtime/migration lifecycle adapters select transaction `6543` and session `5432` respectively
- [ ] `CRON_SECRET` is set and strong (≥32 random chars)

### Database
- [ ] Latest Prisma migration deployed: `npx prisma migrate deploy`
- [ ] RLS policies applied: `prisma/rls-policies.sql`
- [ ] `npm run verify-rls` passes
- [ ] No pending migrations

### Auth
- [ ] Supabase project in production mode (not paused)
- [ ] Email verification configured in Supabase Auth settings
- [ ] OAuth providers (Google) configured with production callback URLs

### Email
- [ ] `RESEND_API_KEY` set and valid
- [ ] `RESEND_FROM_EMAIL` is a verified sending domain in Resend
- [ ] Test email send from dashboard works
- [ ] No test mode email stubbing active in production

### Billing
- [ ] Stripe live Checkout configured
- [ ] Billing webhook registered in Stripe dashboard with correct URL
- [ ] `STRIPE_BILLING_WEBHOOK_SECRET` set for production webhook
- [ ] Connect webhook registered with correct URL
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET` set for production webhook

### Cron
- [ ] Vercel Cron enabled in Vercel dashboard
- [ ] Cron route responds to test invocation with correct auth
- [ ] No rate limiting on cron route from Vercel side

### Security
- [ ] No hardcoded secrets in source
- [ ] `.env*` files excluded from git
- [ ] All webhook endpoints verify signatures

### Tests and Quality
- [ ] `npm run test` passes
- [ ] `npm run build` passes without errors
- [ ] `npm run lint` passes

### Scaffolded Features
- [ ] Scaffolded features (AI rewrite, custom templates, team invites) do not break in production
- [ ] They return appropriate responses (not errors) when accessed

## Expected Output

1. **Ready** — items confirmed production-ready
2. **Blockers (P0)** — must fix before going live
3. **Recommended (P1)** — should fix soon after launch
4. **Optional (P2/P3)** — nice to have

## Acceptance Criteria
- No P0 blockers remain
- All env vars confirmed documented
- All webhook secrets confirmed set
- RLS isolation confirmed
