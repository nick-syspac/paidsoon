# Owner's Digest Implementation Note

## Discovery Summary

- Dashboard module routes already follow a consistent sibling pattern under `app/dashboard/*` such as `commitguard`, `spendleak`, `tax-buffer`, `margin-guard`, and `runway-guard`.
- The dashboard shell delegates module visibility and width behavior through [components/dashboard/DashboardMain.tsx](/Users/syspac/work/paidsoon/components/dashboard/DashboardMain.tsx) and its nav rail.
- The main overview composition point is [app/dashboard/page.tsx](/Users/syspac/work/paidsoon/app/dashboard/page.tsx), which already aggregates SpendLeak, Tax Buffer, CommitGuard, MarginGuard, and RunwayGuard summaries into one page.
- Settings navigation is centralized in [lib/settings/navigation.ts](/Users/syspac/work/paidsoon/lib/settings/navigation.ts), and module settings pages live under `app/dashboard/settings/*`.
- Feature gating is centralized in [lib/subscriptionPlans.ts](/Users/syspac/work/paidsoon/lib/subscriptionPlans.ts), with existing helper access patterns such as `canAccessTaxBuffer`, `canAccessMarginGuard`, and `canAccessRunwayGuard` used from dashboard pages.
- User-facing settings APIs commonly use `createClient().auth.getUser()` plus `withUserContext(user.id, ...)`, as shown by [app/api/settings/cost-guard/route.ts](/Users/syspac/work/paidsoon/app/api/settings/cost-guard/route.ts).
- Scheduled background work is dispatched from Railway into internal Next.js job routes secured by `INTERNAL_JOBS_SECRET`, as shown by [app/api/internal/jobs/send-weekly-debtor-summary/route.ts](/Users/syspac/work/paidsoon/app/api/internal/jobs/send-weekly-debtor-summary/route.ts) and the worker beat/task wiring.
- Customer-facing email delivery is centralized in [lib/email/send.ts](/Users/syspac/work/paidsoon/lib/email/send.ts); Owner's Digest should add to that path rather than create a parallel sender.
- Existing FinOps modules store derived tenant-scoped state in Prisma under `UserProfile` relations, with patterns already present for Cost Guard, MarginGuard, RunwayGuard, Tax Buffer, and CommitGuard in [prisma/schema.prisma](/Users/syspac/work/paidsoon/prisma/schema.prisma).
- Team seats remain unimplemented, and the current product behavior effectively assumes one active tenant owner in many settings flows, as shown by [app/dashboard/settings/team/page.tsx](/Users/syspac/work/paidsoon/app/dashboard/settings/team/page.tsx). That means the first Owner's Digest settings and recipient model can safely remain user-owned and tenant-scoped via `userId` until broader multi-user seat workflows are operational.

## Route And Navigation Targets

- Dashboard route: add `app/dashboard/owners-digest/page.tsx` as a sibling module page.
- Dashboard navigation: extend [components/dashboard/DashboardMain.tsx](/Users/syspac/work/paidsoon/components/dashboard/DashboardMain.tsx) and the nav rail component it renders so Owner's Digest appears as a first-class module.
- Overview summary card: extend [app/dashboard/page.tsx](/Users/syspac/work/paidsoon/app/dashboard/page.tsx) with a compact Owner's Digest executive summary card.
- Settings route: add `app/dashboard/settings/owners-digest/page.tsx` and register it in [lib/settings/navigation.ts](/Users/syspac/work/paidsoon/lib/settings/navigation.ts).

## Backend And Domain Targets By Capability

### owners-digest-foundation

- Prisma schema and relations: [prisma/schema.prisma](/Users/syspac/work/paidsoon/prisma/schema.prisma)
- RLS policies: `prisma/rls-policies.sql`
- Repository and service helpers: new `lib/ownersDigest/*`
- Current and historical read paths: new `app/api/owners-digest/*`

### owners-digest-signals-and-scoring

- Shared domain types and scoring engine: new `lib/ownersDigest/types.ts`, `lib/ownersDigest/scoring.ts`, `lib/ownersDigest/summary.ts`
- Provider registry: new `lib/ownersDigest/providers/*`
- Provider reuse points:
  - PaidSoon overview and invoice risk signals from `lib/dashboard/*`, `lib/invoices/*`, `lib/arrangements.ts`, and promise helpers
  - SpendLeak from `lib/dashboard/loadSpendLeakDashboard.ts` and `lib/spendleak/*`
  - CostGuard from `lib/costGuard/foundation.ts`
  - CashPlan from `lib/cashplan/engine.ts`
  - Tax Buffer from `lib/taxBuffer/service.ts` and `lib/taxBuffer/engine.ts`
  - CommitGuard from `lib/commitguard/service.ts`
  - MarginGuard from `lib/marginguard/service.ts`
  - RunwayGuard from existing snapshot reads under dashboard and route services

### owners-digest-dashboard

- Page route: `app/dashboard/owners-digest/page.tsx`
- Page components: new `components/dashboard/ownersDigest/*`
- History route or detail route: `app/dashboard/owners-digest/[digestId]/page.tsx` or equivalent period-driven child route

### owners-digest-email-delivery

- Generation and mail orchestration: new `lib/ownersDigest/service.ts` plus digest-specific email helpers under `lib/email/*`
- Internal scheduler entrypoint: `app/api/internal/jobs/send-owners-digest/route.ts`
- Worker dispatch additions: `worker/paidsoon_worker/tasks.py`, `worker/paidsoon_worker/celery_app.py`, and related config if cadence is activated now

### owners-digest-settings

- Settings page: `app/dashboard/settings/owners-digest/page.tsx`
- Settings API: `app/api/owners-digest/settings/route.ts` or `app/api/settings/owners-digest/route.ts`
- Validation and defaults: `lib/ownersDigest/settings.ts`

## Modified Capability Targets

- `dashboard-overview`: extend [app/dashboard/page.tsx](/Users/syspac/work/paidsoon/app/dashboard/page.tsx)
- `subscription-plan-tiers`: extend [lib/subscriptionPlans.ts](/Users/syspac/work/paidsoon/lib/subscriptionPlans.ts) and any module-access helpers in `lib/dashboard/*Access.ts`
- `implementation-gated-entitlements`: reuse `isFeatureImplemented(...)` and feature-unavailable response patterns already used by Team settings and other staged features

## Constraints Confirmed During Discovery

- Do not create a second email subsystem; reuse [lib/email/send.ts](/Users/syspac/work/paidsoon/lib/email/send.ts) conventions.
- Do not implement scheduler business logic in Python; the worker dispatches to internal job routes and should continue doing that for Owner's Digest.
- Do not trust tenant identifiers from the client; user-facing reads and writes continue to derive scope from Supabase auth and `withUserContext(user.id, ...)`.
- Do not expose unavailable module gaps as broken cards; omit non-entitled or inactive providers from the digest signal set.

## Rollout Notes

- Apply the Prisma migration and then re-apply [prisma/rls-policies.sql](/Users/syspac/work/paidsoon/prisma/rls-policies.sql) before enabling the dashboard or delivery surfaces in shared environments.
- Regenerate the Prisma client after the migration so the new Owner's Digest delegates are available at runtime.
- Railway worker rollout requires deploying the updated worker image so `dispatch_owners_digest` and `tasks.owners_digest` are registered before relying on scheduled delivery.
- No new environment variables were introduced by the current implementation. Delivery reuses existing `RESEND_API_KEY`, `RESEND_FROM_*`, `SUPABASE_SECRET_KEY`, and `INTERNAL_JOBS_SECRET` values.
- Post-deploy verification should include: `npx prisma validate`, `npm run db:apply-rls`, `npm run verify-rls`, the focused Owner's Digest test slice, and one manual dashboard/settings walk-through on an entitled tenant.

## Rollback Notes

- Disable Owner's Digest access by plan gating or remove the navigation entry if the dashboard surface needs to be hidden without rolling back unrelated modules.
- Pause or remove the `dispatch-owners-digest` worker schedule if email delivery needs to stop while keeping snapshots readable in-product.
- Because the schema changes are additive, prefer forward-fixes and feature disablement over destructive rollback of persisted digest history.
