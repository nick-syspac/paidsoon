## Why

PaidSoon currently improves collections after invoices are issued, but there is no tenant-safe workflow to request and track deposits or progress payments before and during job delivery. Adding DepositGuard closes that cash-flow gap, reduces commencement risk, and extends the existing FinOps module set (CashPlan, Owner's Digest, RunwayGuard) with earlier-stage receivables control.

## What Changes

- Add a new DepositGuard module with tenant-isolated job, deposit request, payment, reminder, and audit-event workflows.
- Introduce DepositGuard dashboard and job detail routes under the existing dashboard architecture, plus a secure public payment-request page using hashed tokens.
- Add MVP server APIs and services for manual job creation, deposit calculations, request sending, view tracking, manual payment recording, commencement blocking/unblocking, and idempotent reminder automation.
- Add plan-gated entitlements for DepositGuard actions using the existing feature-check framework (server-enforced and UI-reflected).
- Add provider-neutral interfaces and placeholders for Phase 2 quote import/reconciliation (Xero, MYOB, Stripe Connect customer payments) without introducing unsupported production payment flows.
- Integrate DepositGuard signals with existing CashPlan, Owner's Digest, and RunwayGuard extension points via module-facing services/events rather than direct UI coupling.
- Update marketing-site module portfolio surfaces and DepositGuard messaging so public positioning reflects shipped vs planned capability boundaries.
- Add schema, migration, and RLS policy updates for all new DepositGuard tables and public token access boundaries.
- Add tests for calculations, tenancy/RLS protection, idempotency, entitlement enforcement, status transitions, and secure-link behavior.

## Capabilities

### New Capabilities
- `deposit-guard-foundation`: DepositGuard domain model, statuses, server APIs, entitlement guards, and commencement protection lifecycle.
- `deposit-guard-public-payment-request-page`: Secure public customer payment-request links with token hashing, view tracking, and revoked/expired handling.
- `deposit-guard-reminder-automation`: Scheduled reminder lifecycle for deposit requests with idempotent delivery/audit behavior.
- `deposit-guard-milestone-schedules`: Progress-payment milestone definition and request generation for Business Pro.

### Modified Capabilities
- `subscription-plan-tiers`: Add DepositGuard-specific feature flags and limits to plan definitions and gating behavior.
- `implementation-gated-entitlements`: Extend module-level entitlement handling to include DepositGuard preview/upgrade UX with server-side enforcement.
- `dashboard-overview`: Include DepositGuard commencement/payment alerts in existing dashboard attention surfaces.
- `owners-digest-signals-and-scoring`: Add DepositGuard contribution signals (requested, collected, overdue, blocked jobs) where enabled.
- `marketing-module-portfolio-pages`: Add DepositGuard as a first-class module destination and cross-link target in portfolio/navigation surfaces.
- `marketing-feature-claim-accuracy`: Ensure DepositGuard marketing claims separate MVP-delivered behavior from planned Phase 2 integrations.

## Impact

- Affected systems: Prisma schema and migrations, `prisma/rls-policies.sql`, App Router dashboard/public routes, API route handlers, billing entitlements, scheduler/email pipelines, analytics/events, module integration services, and marketing-site module portfolio surfaces.
- New APIs/routes: DepositGuard dashboard/job APIs, public pay route, and reminder scheduling execution paths.
- Dependencies/patterns reused: `withUserContext` RLS pattern, `requireFeature` gating, existing cron/internal-jobs reminder architecture, existing email sending abstraction (`sendFollowUpEmail`), and existing accounting-provider abstractions.
- Key assumptions documented for implementation:
  - Existing Stripe usage is focused on PaidSoon subscription billing; customer deposit collection through connected accounts is not treated as already production-ready until validated in implementation.
  - MVP supports secure external payment links and manual payment recording first, with provider adapters ready for Stripe Connect quote/payment expansion in Phase 2.
  - DepositGuard follows current single-account user scoping conventions (`userId` + RLS) unless a broader tenant model is introduced elsewhere in the codebase.