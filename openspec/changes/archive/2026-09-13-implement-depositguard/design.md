## Context

See `proposal.md` for motivation and scope.

Current repository constraints that shape this design:

- Runtime stack is Next.js App Router + TypeScript + Prisma on Supabase Postgres.
- User-scoped data access must run through `withUserContext(userId, ...)` so RLS and `auth.uid()` apply.
- Service paths (cron/webhooks/bootstrap) use `prismaAdmin` with explicit constraints.
- Subscription entitlements are centralized in `lib/subscriptionPlans.ts` and evaluated via `requireFeature`/`hasPlanFeature`.
- Existing reminder automation and delivery patterns exist in `app/api/cron/send-emails/route.ts`, `app/api/internal/jobs/send-reminder/route.ts`, and `lib/email/*`.
- Existing accounting integrations already use provider abstractions (`lib/providers/accounting/*`) for Xero/MYOB.
- Stripe is production-used for PaidSoon subscription billing; customer-payment collection needs a separate DepositGuard payment-provider abstraction to avoid coupling or incorrect fund routing assumptions.

## Goals / Non-Goals

**Goals:**

- Deliver DepositGuard MVP as a tenant-safe, auditable module that supports:
  - manual job creation
  - deposit calculation and request lifecycle
  - secure public payment-request page
  - manual payment recording
  - commencement blocking/unblocking
  - idempotent reminders
  - plan-gated actions and limits
- Reuse established patterns for auth, RLS, entitlements, reminders, and dashboard/settings structure.
- Add clean interfaces for advanced provider integrations (Stripe Connect customer payments, Xero/MYOB quote import, reconciliation) without overbuilding unfinished production integrations.
- Ensure marketing-site surfaces introduce DepositGuard with accurate MVP-vs-planned claim boundaries and links to module destinations.

**Non-Goals:**

- Replacing current billing infrastructure or changing subscription-billing flows.
- Introducing a new backend framework or parallel auth/tenant model.
- Building complete quote sync/reconciliation automation in MVP when source endpoints or operational readiness are not yet available.
- Storing card data or creating a custom PCI payment flow.

## Decisions

### Decision 1: Model DepositGuard as first-class relational entities with explicit statuses

- Choice: Add dedicated Prisma models for `DepositGuardJob`, `DepositRequest`, `PaymentMilestone`, `DepositPayment`, and `DepositReminder`, plus event/audit integration references.
- Rationale: Existing modules use explicit relational tables and status enums for deterministic workflow state and reporting.
- Alternatives considered:
  - Reuse generic invoice tables: rejected because pre-invoice deposit lifecycle semantics and public-token flows differ materially.
  - Store all module state in JSON blobs: rejected due to weak queryability, RLS policy complexity, and poor auditability.

### Decision 2: Keep tenant isolation aligned with current user-scoped RLS architecture

- Choice: User-facing DepositGuard reads/writes run under `withUserContext`; only approved service paths use `prismaAdmin`.
- Rationale: This is the repository's canonical isolation contract and is already verified via existing RLS testing practices.
- Alternatives considered:
  - Introduce custom tenant filters in every query: rejected because policy drift and IDOR risk increase.

### Decision 3: Create DepositGuard feature gates inside the central plan catalog

- Choice: Add DepositGuard features/limits to `SubscriptionFeature` and plan definitions, then consume through module-level entitlement helpers.
- Rationale: Avoids scattered plan string comparisons and matches existing module gating strategy.
- Alternatives considered:
  - UI-only gating: rejected because APIs would remain bypassable.
  - Module-local hardcoded tier map: rejected because catalog drift risk is high.

### Decision 4: MVP payment architecture defaults to external-link + manual recording with provider abstraction

- Choice: Implement provider-neutral `DepositPaymentProvider` interfaces and use secure external payment links/manual recording as the guaranteed MVP path.
- Rationale: Prevents accidental routing of customer funds through SaaS billing accounts while enabling future Stripe Connect support.
- Alternatives considered:
  - Immediate Stripe Connect checkout implementation as mandatory MVP: deferred unless current repository validation confirms full connected-account onboarding and operational readiness for customer funds.

### Decision 5: Public payment pages use hashed tokens, idempotent views, and no-index controls

- Choice: Store token hashes, never raw long-term token identifiers; track first/last view transitions idempotently.
- Rationale: Aligns with security requirements for IDOR resistance and safe public resource exposure.
- Alternatives considered:
  - Signed short-lived URLs only: useful complement, but hashed persisted token model better supports revocation and audit timelines.

### Decision 6: Reminder automation extends existing scheduler/email patterns

- Choice: Reuse existing cron/internal-jobs dispatch style, idempotency tracking, and centralized send abstraction instead of creating a new reminder engine stack.
- Rationale: Preserves operational consistency and reduces launch risk.
- Alternatives considered:
  - New standalone worker for DepositGuard only: deferred; adds infra complexity without MVP benefit.

### Decision 7: Module integration happens through shared service contracts and events

- Choice: Emit DepositGuard expected/received cash data through service interfaces consumed by CashPlan, Owner's Digest, and RunwayGuard.
- Rationale: Limits cross-module coupling and matches current pattern of module-specific service layers.
- Alternatives considered:
  - Direct UI component dependencies between modules: rejected as brittle and hard to test.

### Decision 8: Marketing rollout follows shared module-portfolio and claim-accuracy specs

- Choice: Update marketing module catalog/surfaces and module pages with DepositGuard positioning that reflects implemented MVP behavior and clearly labels planned integrations.
- Rationale: Existing marketing specs already require centralized module portfolio signaling and accurate live-vs-planned claims.
- Alternatives considered:
  - Delayed marketing update after backend ship: rejected because it creates mismatch between discoverability and product reality.

### Decision 9: Stripe customer-payment readiness is partial, so MVP remains external-link/manual-first

- Choice: Keep DepositGuard MVP on external payment URL + manual payment recording, with Stripe customer-payment flows behind provider abstractions and explicit unavailable/setup-required responses.
- Evidence:
  - Stripe Connect OAuth/account linking exists for invoice ingestion at `app/api/stripe/connect/*`.
  - Connect webhook handling exists at `app/api/webhooks/stripe-connect/route.ts` for `invoice.overdue` and `invoice.paid` ingestion/reminder lifecycle.
  - Billing checkout/webhook paths (`app/api/billing/checkout/route.ts`, `app/api/webhooks/stripe-billing/route.ts`) are scoped to PaidSoon subscription billing, not customer deposit collection.
  - No existing connected-account Checkout session flow for customer deposit requests is present.
- Rationale: Avoids routing customer deposit funds through unverified or incomplete flows while preserving a clean upgrade path to connected-account collection.
- Alternatives considered:
  - Treat existing Stripe infrastructure as customer-payment-ready by default: rejected due to missing DepositGuard-specific checkout and webhook lifecycle coverage.

### Decision 10: DepositGuard product events use diagnostics tracing plus domain event rows (not Vercel page analytics)

- Choice: Emit DepositGuard business events through server-side domain event persistence + diagnostics tracing patterns; reserve `@vercel/analytics` for web/page analytics only.
- Evidence:
  - Diagnostics trace pipeline exists (`lib/diagnostics/server.ts`) and is reused across dashboard and route operations.
  - Admin audit logger exists (`lib/admin/audit.ts`) but is platform-admin scoped, not tenant financial workflow logging.
  - App layout includes `@vercel/analytics/next` for product usage/page telemetry, not transactional financial audit trails.
- Contract for DepositGuard:
  - Material financial lifecycle changes (request created/sent, payment recorded/confirmed, commencement unblocked) MUST create domain event rows.
  - Operational traces SHOULD emit `traceEvent`/`traceOperation` metadata (without PII or secrets) for diagnosability.
  - Marketing/dashboard usage interactions MAY emit non-PII page analytics events where existing abstractions are already used.

## Risks / Trade-offs

- [Risk] Existing schema and RLS conventions can be easy to violate in new routes.
  - Mitigation: Enforce `withUserContext` in user-facing services; add integration tests for cross-tenant access denial and RLS behavior.
- [Risk] Public token endpoints can be abused.
  - Mitigation: Hashed tokens, no-index headers, rate limiting, minimal response payloads, and idempotent view-event handling.
- [Risk] Reminder duplicates under retries/background overlap.
  - Mitigation: Dedup keys per request/reminder stage/time, persisted send-attempt records, retry-safe status checks.
- [Risk] Plan-gating mismatch between UI and API.
  - Mitigation: Centralized entitlement helpers and deterministic API responses for upgrade-required/limit-reached states.
- [Risk] Provider integration ambiguity (Stripe Connect readiness, quote source coverage).
  - Mitigation: Ship interface-first placeholders in MVP; gate unsupported operations with explicit setup messaging.

## Migration Plan

1. Add Prisma models/enums + migration for DepositGuard entities.
2. Extend `prisma/rls-policies.sql` with DepositGuard policies and verify isolation.
3. Add entitlement catalog entries and module entitlement helpers.
4. Implement server-side domain services (calculations, lifecycle transitions, audit/event emission).
5. Implement API routes for create/send/view/record-payment/reminders with Zod validation.
6. Implement public payment-request route and idempotent view tracking.
7. Add dashboard list/detail and settings surfaces following existing module/page conventions.
8. Wire module outputs into CashPlan/Owner's Digest/RunwayGuard integration points.
9. Add tests (unit, integration, E2E-shaped workflow tests using repo conventions).
10. Update marketing module portfolio and module pages for DepositGuard positioning and accurate claim labeling.
11. Update docs (`docs/DDD.md`, runbooks/env matrix, module docs, testing instructions).

Rollback strategy:

- Keep feature flagged by entitlement defaults while deploying schema/services.
- If rollback is required, disable DepositGuard entitlements and stop reminder dispatch paths before data migration rollback actions.

## Implementation Sequence

1. Implement schema primitives first (`prisma/schema.prisma` enums/models, indexes, migration) and align `prisma/rls-policies.sql`.
2. Add entitlement catalog entries and DepositGuard entitlement helpers before opening any operational API route.
3. Build core server-domain services (calculation, lifecycle transitions, event emission) and unit-test them in isolation.
4. Implement authenticated DepositGuard APIs with Zod validation and `withUserContext` isolation.
5. Implement secure public token route and idempotent view tracking.
6. Wire reminder scheduling/sending into existing cron/internal-jobs pathways with dedup protections.
7. Build dashboard/settings and job workflow UI against stabilized APIs.
8. Integrate DepositGuard outputs into CashPlan, Owner's Digest, and RunwayGuard service hooks.
9. Update marketing module portfolio and DepositGuard positioning copy.
10. Run lint/type/test/verify-rls and only then mark remaining tasks complete.

## Open Questions

- Should the initial DepositGuard reminder scheduler run inside existing daily cron cadence only, or add finer-grained internal job scheduling in MVP?