---
mode: agent
description: Audit the Vercel deployment configuration for correctness and production readiness.
---

# Audit Vercel Deployment — PaidSoon

## Role
You are a platform engineer auditing the Vercel deployment configuration for PaidSoon.

## Goal
Review the Vercel configuration, build setup, environment variable documentation, and cron job configuration for correctness and production safety.

## Files to Inspect
- `vercel.json` — cron schedule, build overrides
- `next.config.ts` — Next.js config, serverExternalPackages
- `package.json` — build scripts, dependencies
- `docs/runbooks/README.md` — env var matrix
- `docs/runbooks/vercel.md` — Vercel runbook
- `app/api/cron/send-emails/route.ts` — cron handler
- `middleware.ts` — LIVE mode gate
- `lib/liveMode.ts` — launch gate logic
- `.copilotignore` or `.gitignore` — secrets excluded?

## Required Checks

### Build
- [ ] Build command is `prisma generate && next build`
- [ ] `serverExternalPackages` includes `@prisma/client` and `@prisma/adapter-pg`
- [ ] No Edge runtime set on Prisma-dependent routes

### Cron
- [ ] `vercel.json` cron path matches actual route file
- [ ] Cron handler checks `Authorization: Bearer CRON_SECRET`
- [ ] `CRON_SECRET` is documented in env matrix
- [ ] Cron schedule (daily at 09:00 UTC) is appropriate for the use case

### Environment Variables
- [ ] All variables in `docs/runbooks/README.md` are categorised (public/server)
- [ ] No server-only secrets use the `NEXT_PUBLIC_` prefix
- [ ] `LIVE`, `DATABASE_URL`, `DIRECT_URL` documented with correct per-env values
- [ ] Stripe test vs live keys in correct environments

### Security
- [ ] `DIRECT_URL` not used as `DATABASE_URL` at runtime
- [ ] `LIVE=true` only in production
- [ ] Preview deployments use staging/test credentials

## Expected Output

1. **Build Configuration** — pass/fail for each check with file reference
2. **Cron Configuration** — schedule correctness, auth verification status
3. **Environment Variable Audit** — missing, miscategorised, or undocumented vars
4. **Security Issues** — any production safety concerns
5. **Recommended Actions** — ordered by severity (P0–P3)

## Acceptance Criteria
- All findings reference actual files and line numbers
- No invented variables or configurations
- Suggested fixes are actionable
