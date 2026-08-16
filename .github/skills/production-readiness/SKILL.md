# Skill: Production Readiness — PaidSoon

## When to Use This Skill
Use when preparing PaidSoon for a launch, major release, or post-launch health check.

## Status
Confirmed applicable to this codebase.

## Inputs Required
- Target environment (preview, production)
- Scope of the release (new feature, schema change, billing change)

## Files to Inspect
- `vercel.json` — cron and deployment config
- `next.config.ts` — build config
- `package.json` — build scripts
- `prisma/schema.prisma` — DB schema
- `prisma/rls-policies.sql` — tenant isolation
- `proxy.ts` — LIVE gate and auth
- `docs/runbooks/README.md` — env var matrix
- `lib/liveMode.ts` — launch gate logic

## Production Readiness Checklist

### Code
- [ ] `npm run build` passes (includes `prisma generate`)
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] No TypeScript errors (`tsc --noEmit` or via build)

### Database
- [ ] `npm run prisma:migrate:status` shows no pending migrations
- [ ] RLS policies applied: `npm run db:apply-rls`
- [ ] `npm run verify-rls` passes

### Environment
- [ ] `LIVE=true` in production Vercel
- [ ] All env vars from `docs/runbooks/README.md` set in production
- [ ] Stripe **live** keys in production (not test keys)
- [ ] Canonical Supabase inputs are production-scoped and no derived URLs are externally configured
- [ ] `CRON_SECRET` set (≥32 random chars)

### Stripe
- [ ] Billing webhook URL registered in Stripe dashboard
- [ ] `STRIPE_BILLING_WEBHOOK_SECRET` set for production webhook
- [ ] Connect webhook URL registered
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET` set for production webhook
- [ ] Stripe Checkout tested end-to-end in test mode before switching to live

### Supabase
- [ ] Supabase project in production mode (not paused)
- [ ] Email verification configured
- [ ] OAuth (Google) configured with production redirect URIs
- [ ] Row count and plan limits appropriate for expected load

### Email
- [ ] `RESEND_FROM_EMAIL` domain verified in Resend dashboard
- [ ] Test email send confirmed working
- [ ] `RESEND_API_KEY` is a production key

### Cron
- [ ] Vercel Cron enabled in Vercel dashboard
- [ ] Manual cron invocation test passes (with correct `CRON_SECRET` header)
- [ ] Cron handler logs are accessible in Vercel dashboard

### Scaffolded Features
- [ ] AI rewrite routes return graceful placeholder (not 500)
- [ ] Custom template routes return graceful placeholder (not 500)
- [ ] Team invite route returns appropriate response

## Pre-Launch Sequence

1. Set `LIVE=true` in Vercel production env
2. Run `npx prisma migrate deploy` (CI/CD should do this)
3. Verify `npm run verify-rls` passes
4. Verify Stripe webhooks active in dashboard
5. Verify Resend domain verified
6. Do a smoke test: sign up, connect Stripe, view dashboard

## Rules to Follow
- Never use `DIRECT_URL` as runtime `DATABASE_URL`
- Never deploy with Stripe test keys to production
- Always verify webhook secrets are production-specific
- Always run `verify-rls` after any schema migration

## Common Mistakes to Avoid
- Setting `LIVE=true` in preview (premature)
- Forgetting to run `prisma migrate deploy` before going live
- Using test Stripe keys in production
- Not verifying Resend sending domain before launch

## Output Format
- Checklist with pass/fail per item
- Ordered list of blockers to resolve
- Smoke test steps

## Acceptance Checklist
- [ ] All P0 items pass
- [ ] `LIVE=true` set in production
- [ ] Stripe live keys in production
- [ ] Webhooks verified
- [ ] `npm run verify-rls` passes
