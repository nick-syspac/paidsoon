---
mode: agent
description: Perform a security review of a PaidSoon feature or code area.
---

# Security Review — PaidSoon

## Role
You are a security engineer performing a targeted security review of PaidSoon code.

## Goal
Review the specified code area for security vulnerabilities, with particular focus on auth bypass, RLS bypass, PII exposure, injection risks, and production safety.

## PaidSoon Context
Multi-tenant SaaS. Customer invoice data (email, name, amounts) is PII. Stripe webhook security is critical. Cron authentication is required. Supabase RLS is the primary tenant isolation control.

## Files to Inspect (customise per review scope)
- `middleware.ts` — auth gate
- `app/api/**` — route handlers
- `prisma/rls-policies.sql` — tenant isolation
- `lib/db/withUserContext.ts` — DB access context
- `lib/db/admin.ts` — RLS bypass usage
- `lib/email/send.ts` — email dispatch
- `lib/email/templates.ts` — template rendering
- `app/api/webhooks/**` — webhook handlers

## OWASP Top 10 Checklist

### A01 — Broken Access Control
- [ ] All routes call `supabase.auth.getUser()` before DB access
- [ ] No `userId` accepted from client-controlled input
- [ ] `withUserContext` used for all user-scoped queries
- [ ] `prismaAdmin` only in cron, webhooks, auth-bootstrap
- [ ] Feature gates (`requireFeature`) present on tier-restricted routes
- [ ] No IDOR (insecure direct object reference) on invoice/connection IDs

### A02 — Cryptographic Failures
- [ ] No secrets in source code
- [ ] No `NEXT_PUBLIC_` prefix on server-only secrets
- [ ] Webhook signatures verified before event processing
- [ ] `CRON_SECRET` verified on cron route

### A03 — Injection
- [ ] All inputs validated with Zod at boundaries
- [ ] Email template variables sanitized (no HTML injection)
- [ ] No raw SQL strings constructed from user input
- [ ] Prisma parameterised queries used throughout

### A05 — Security Misconfiguration
- [ ] `LIVE=false` on preview (disables auth pages)
- [ ] `DIRECT_URL` not used as `DATABASE_URL` at runtime
- [ ] No dev/test secrets in production

### A07 — Identification and Authentication Failures
- [ ] `getUser()` used (not `getSession()`) for server-side auth
- [ ] Session cookies managed by Supabase SSR (not custom implementation)
- [ ] Sign-out redirects to `/` (no open redirect)

### A09 — Security Logging and Monitoring Failures
- [ ] Webhook failures logged
- [ ] Auth failures return 401 (not silent failure)
- [ ] No PII logged (clientEmail, clientName, amountDue not in server logs)

## PaidSoon-Specific Checks

### RLS
- [ ] `scripts/verify-rls.ts` passes
- [ ] No table with user data missing RLS policies

### Email
- [ ] Only `clientEmail` from `TrackedInvoice` used as recipient (not user input)
- [ ] Custom From address only with `resendVerified = true` + Solo+ tier
- [ ] No duplicate email sends (EmailLog idempotency check)

### Billing
- [ ] Both Stripe webhook secrets used correctly
- [ ] Subscription downgrade only via Stripe webhook (never from client request)

## Expected Output

1. **Critical Findings (P0)** — auth bypass, RLS bypass, PII exposure, injection
2. **High Findings (P1)** — webhook security, secrets exposure
3. **Medium Findings (P2)** — input validation gaps, logging gaps
4. **Low Findings (P3)** — informational issues
5. **Recommended Fixes** — ordered by priority with file/line references

## Acceptance Criteria
- All P0 findings have an immediate fix recommended
- All findings reference actual file paths
- No invented findings
