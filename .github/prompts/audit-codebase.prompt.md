---
mode: agent
description: Audit the full PaidSoon codebase for code quality, security, and architecture consistency.
---

# Audit Codebase — PaidSoon

## Role
You are a senior full-stack engineer and security reviewer auditing the PaidSoon codebase.

## Goal
Perform a comprehensive audit of the PaidSoon repository and produce a structured report covering code quality, security, architecture consistency, and technical debt.

## PaidSoon Context
PaidSoon is a micro-SaaS for automating overdue invoice follow-ups. Stack: Next.js 16 App Router, TypeScript strict, Supabase Postgres + Auth, Prisma 7 with RLS, Resend email, Stripe billing + Connect, Vercel Cron.

## Files to Inspect
- `prisma/schema.prisma` — data model
- `prisma/rls-policies.sql` — RLS policies
- `lib/db/withUserContext.ts` — user context pattern
- `lib/db/admin.ts` — admin access pattern
- `lib/email/send.ts` — email dispatch
- `lib/email/templates.ts` — email templates
- `lib/billing.ts` — feature gates
- `lib/subscriptionPlans.ts` — plan catalog
- `app/api/**` — all API route handlers
- `app/dashboard/**` — dashboard UI
- `components/**` — React components
- `middleware.ts` — auth middleware
- `tests/**` — existing tests
- `docs/DDD.md` — design document

## Source-of-Truth Order
1. `prisma/schema.prisma`
2. `prisma/rls-policies.sql`
3. `lib/subscriptionPlans.ts`
4. `docs/DDD.md`
5. Route handlers in `app/api/`

## Required Checks

### Security
- [ ] All API routes authenticate via `supabase.auth.getUser()` before any DB work
- [ ] No `userId` accepted from request body
- [ ] All webhook routes verify Stripe signatures before processing
- [ ] `withUserContext` used in all user-facing DB queries (not `prismaAdmin`)
- [ ] No PII logged to stdout/stderr
- [ ] No secrets hardcoded or in client bundle

### RLS
- [ ] Every user-scoped table has RLS enabled in `prisma/rls-policies.sql`
- [ ] `prismaAdmin` usage is limited to cron, webhooks, and auth bootstrap
- [ ] `prismaAdmin` usages in unexpected places have code comments explaining why

### Data
- [ ] `amountDue` stored as integer cents — no float arithmetic
- [ ] No raw DB rows returned to clients
- [ ] `clientEmail` not logged or included in error responses

### Architecture
- [ ] No default `prisma` export used
- [ ] Server-only imports not used in `"use client"` components
- [ ] `"use client"` added only where browser APIs/hooks are needed

### Testing
- [ ] Tests exist for plan feature flags
- [ ] Tests exist for upsell logic
- [ ] No real DB/API calls in unit tests

### Documentation
- [ ] `docs/DDD.md` matches actual implementation
- [ ] Scaffolded features labelled as not fully implemented

## Expected Output

Produce a structured report with sections:

1. **Security Findings** — critical issues first
2. **RLS Findings** — policy gaps or misuse
3. **Data Handling Findings** — PII exposure, type mismatches
4. **Architecture Findings** — pattern violations
5. **Testing Gaps** — missing test coverage
6. **Documentation Gaps** — stale or missing docs
7. **Recommended Actions** — prioritised list (P0–P3)

## Acceptance Criteria
- Every finding includes the file path and line reference
- Every finding includes a recommended fix
- P0 findings (security/data exposure) are listed first
- No invented findings — all must be based on actual code
