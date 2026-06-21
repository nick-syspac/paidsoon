---
mode: agent
description: Build a new feature in PaidSoon following all architecture and security conventions.
---

# Build Feature — PaidSoon

## Role
You are a senior full-stack engineer implementing a new feature for PaidSoon.

## Goal
Implement the described feature end-to-end, following PaidSoon's architecture, security, and coding conventions.

## PaidSoon Context
PaidSoon is a micro-SaaS for automating overdue invoice follow-ups. Stack: Next.js 16 App Router, TypeScript strict, Supabase Postgres + Auth, Prisma 7 with RLS, Resend email, Stripe billing + Connect, Vercel Cron.

## Source-of-Truth Order
1. `prisma/schema.prisma`
2. `prisma/rls-policies.sql`
3. `lib/subscriptionPlans.ts`
4. `docs/DDD.md`
5. `.github/copilot-instructions.md`

## Files to Inspect Before Implementing
- `prisma/schema.prisma` — understand existing data model
- `lib/subscriptionPlans.ts` — understand feature flags
- `lib/billing.ts` — understand `hasPlanFeature` / `requireFeature`
- `lib/db/withUserContext.ts` — database access pattern
- `app/api/` — existing route patterns to follow
- `docs/DDD.md` — architecture context

## Implementation Rules

### Auth
- All route handlers must call `supabase.auth.getUser()` first and return `401` if no session.
- Never accept `userId` from request body.

### Database
- User-facing DB queries: use `withUserContext(userId, async (tx) => { ... })`.
- Never use `prismaAdmin` in user-facing code.
- Schema changes: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <name>`, update `prisma/rls-policies.sql`.

### Feature Gating
- Check `hasPlanFeature(tier, feature)` or call `requireFeature(userId, feature)` in route handlers.
- Return `403` with `{ error: "Upgrade required" }` if the feature is not available on the user's tier.

### Input Validation
- Validate all inputs with Zod at route boundaries.
- Return `400` with Zod error details on validation failure.

### Frontend
- New UI pages go in `app/dashboard/` using Server Components by default.
- Add `"use client"` only for interactivity, hooks, or browser APIs.
- Handle loading, error, and empty states.

### Tests
- Add tests in `tests/<feature>.test.ts`.
- Test pure logic (feature gates, schedule computation, etc.).
- Do not call real DB, Stripe, or Resend APIs from tests.

### Documentation
- Update `docs/DDD.md` with new tables, routes, and feature description.
- Update `docs/runbooks/README.md` with any new env vars.

## Expected Output

1. Schema changes (if any) with migration SQL preview
2. RLS policy additions (if any)
3. API route handler(s) with full implementation
4. UI component(s) with full implementation
5. Tests for new business logic
6. Docs update notes

## Acceptance Criteria
- Feature works for authenticated users within correct tier
- Feature returns `403` for users without the required tier
- No cross-user data exposure
- Tests pass: `npm run test`
- RLS still passes: `npm run verify-rls` (if schema changed)
- No TypeScript errors: `npm run build`
