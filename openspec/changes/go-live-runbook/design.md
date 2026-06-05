## Context

The application codebase is complete. This runbook covers only the external service configuration required to get PaidSoon running in production. The five phases below must be executed roughly in order because later phases depend on credentials and URLs produced by earlier ones.

The main constraint is Stripe Connect platform approval (Phase 3), which is an async human review process. All other phases are self-service and can be completed back-to-back in a single session.

## Goals / Non-Goals

**Goals:**
- Get PaidSoon running in production, accepting real sign-ups, connecting real Stripe accounts, and sending real follow-up emails
- Enforce the `DATABASE_URL` → `authenticator` role change so RLS is live and provably enforced
- Complete the `paidsoon.com` brand flip in Resend/email (env-var flip, decoupled from code)

**Non-Goals:**
- Any code changes
- Staging/preview environment beyond what Vercel auto-creates from PRs
- Annual billing, multiple subscription tiers, or additional invoice providers

## Decisions

### D1: Single ordered execution plan, not parallel

All phases are listed in dependency order. Skipping Phase 1 (domain) blocks Phase 4 (Vercel env vars) because `RESEND_FROM_EMAIL` needs a verified domain. Skipping Phase 2 (Supabase) blocks Phase 4 (database URLs). The tasks file mirrors this order explicitly.

---

### D2: `DATABASE_URL` must use `authenticator` role at launch

Per `enforce-rls-via-prisma`, the Prisma runtime connection must use the `authenticator` role (not `postgres`/owner). Using the owner role would bypass RLS silently. The `DIRECT_URL` (owner role) is kept for migrations only and is set separately. This must be done before any real user data enters the database.

---

### D3: Stripe Connect approval gates everything Stripe-related

Stripe Connect platform access is a manual Stripe review. Apply on day 1 of this runbook. While waiting, all other phases (domain, Supabase, Vercel scaffold) can proceed. Do not register Connect webhooks or perform the end-to-end test until approval arrives and test mode is enabled.

---

### D4: Env-var flip for branding is a separate, final step

`RESEND_FROM_EMAIL` and `RESEND_FROM_NAME` are changed in Vercel only after `paidsoon.com` DNS is verified in Resend. Per `rename-to-paidsoon` D2, the code merge has already happened; outbound email continues from the old domain until the env vars are flipped. This is the last step before go-live.

---

### D5: Secrets stay in Vercel environment — never in the repo

`.env.local` mirrors production env vars for local development only. It is gitignored. No secret should ever be committed.

## Phase Diagram

```
Phase 1: Domain & DNS
  ├── Register paidsoon.com (if not done)
  ├── Resend: add paidsoon.com sending domain
  └── Complete SPF / DKIM DNS records

        ↓

Phase 2: Supabase
  ├── Create project (dev + prod)
  ├── Note connection strings
  ├── Retrieve authenticator role password
  ├── Configure Auth providers (email + Google OAuth)
  └── Run prisma migrate deploy

        ↓

Phase 3: Stripe  ← may run in parallel while waiting for Connect approval
  ├── Apply for Stripe Connect platform access ← do immediately
  ├── Create PaidSoon Pro product ($19/month)
  └── (after approval) Register webhooks

        ↓

Phase 4: Vercel
  ├── Create project + link GitHub repo
  ├── Set all env vars (Supabase, Stripe, Resend, CRON_SECRET)
  ├── Flip RESEND_FROM_* to paidsoon.com values  ← D4
  └── Trigger deploy

        ↓

Phase 5: Verification
  ├── Run scripts/verify-rls.ts (cross-user isolation)
  ├── npm run build smoke test
  ├── Manual sign-in / dashboard smoke test
  └── Full end-to-end test (Stripe → invoice → emails → payment)
```
