## 1. Discovery and architecture lock

- [x] 1.1 Verify current Stripe customer-payment readiness (connected-account capability, webhook coverage, onboarding assumptions) and record the MVP decision path in this change notes.
- [x] 1.2 Confirm DepositGuard analytics/event sink abstraction used by existing modules and document chosen event contract.
- [x] 1.3 Produce a short implementation plan for code execution order (schema/RLS -> services -> APIs -> UI -> integrations -> docs) and pin it to the change thread.

## 2. Data model and migrations

- [x] 2.1 Add Prisma enums and models for DepositGuard job, request, milestone, payment, and reminder entities with explicit status fields.
- [x] 2.2 Add indexes/uniques for tenant-safe lookups, idempotency, and reminder deduplication.
- [x] 2.3 Generate and review Prisma migration for the new DepositGuard schema.
- [x] 2.4 Update `prisma/rls-policies.sql` with policies for all new DepositGuard tables.
- [x] 2.5 Run RLS verification and add/adjust test coverage proving cross-tenant denial for DepositGuard records.

## 3. Entitlements and permissions

- [x] 3.1 Extend `SubscriptionFeature` and plan catalog with DepositGuard capabilities and limits.
- [x] 3.2 Implement `lib/depositGuard/entitlements.ts` helper functions mirroring existing module entitlement patterns.
- [x] 3.3 Enforce server-side entitlement gates for create/send/record/cancel/milestone/configure actions with deterministic upgrade or limit responses.
- [x] 3.4 Add preview-mode contract for Essentials and Business Control (navigable overview, non-actionable operations).

## 4. Domain services and calculations

- [x] 4.1 Implement decimal-safe deposit calculation service (fixed/percentage, tax handling, rounding, currency inheritance, guardrails).
- [x] 4.2 Implement DepositGuard job lifecycle service including commencement blocking/unblocking transitions.
- [x] 4.3 Implement request lifecycle service for draft/requested/viewed/paid/overdue/cancelled transitions.
- [x] 4.4 Implement manual payment recording service with validation and idempotency keys.
- [x] 4.5 Implement audit/event emission for all material DepositGuard actions.

## 5. Payment-provider abstraction and MVP payment flow

- [x] 5.1 Introduce `DepositPaymentProvider` interface and provider registry structure.
- [x] 5.2 Implement MVP external-payment-link/manual provider adapter and setup messaging.
- [x] 5.3 If connected-account Stripe path is validated, implement server-side checkout-session creation using tenant/job/request metadata; otherwise keep placeholder adapter and explicit unavailable responses.
- [x] 5.4 Add webhook verification/idempotency plumbing for provider events behind provider abstraction contracts.

## 6. API routes

- [x] 6.1 Add authenticated DepositGuard APIs for list/create/update/archive jobs with Zod validation and `withUserContext` access.
- [x] 6.2 Add APIs for create/send/resend/cancel deposit requests, copyable secure-link retrieval, and due-date edits.
- [x] 6.3 Add APIs for manual payment recording and payment status reconciliation hooks.
- [x] 6.4 Add APIs for milestone CRUD and request generation (Business Pro only).
- [x] 6.5 Add APIs for DepositGuard settings and reminder policy configuration with audit logging.

## 7. Public payment-request experience

- [x] 7.1 Add public route `/pay/deposit/[token]` with responsive accessible page states (active, paid, expired, cancelled).
- [x] 7.2 Implement secure token generation, hash storage, expiry/revocation handling, and non-disclosing invalid-token responses.
- [x] 7.3 Implement idempotent first/last view tracking and request-viewed event emission.
- [x] 7.4 Add no-index controls and rate-limiting for public payment-request endpoints.

## 8. Reminder automation

- [x] 8.1 Implement reminder schedule generation for initial, pre-due, due-day, and overdue events from tenant policy.
- [x] 8.2 Extend existing cron/internal-jobs pathways to process DepositGuard reminders idempotently.
- [x] 8.3 Prevent duplicate sends and skip/cancel reminders for paid or cancelled requests.
- [x] 8.4 Persist reminder delivery attempts and failure reasons with safe retry behavior.

## 9. Dashboard, workflow, and settings UI

- [x] 9.1 Add primary `DepositGuard` navigation entry within existing dashboard navigation structure.
- [x] 9.2 Implement `/dashboard/deposit-guard` summary cards, filters, search, and table actions using existing UI components.
- [x] 9.3 Implement guided create-job workflow (customer, quote/job, deposit, review, send) with server-authoritative preview totals.
- [x] 9.4 Implement `/dashboard/deposit-guard/[jobId]` detail page with timeline, reminders, payments, milestones, and commencement status.
- [x] 9.5 Add settings surface for DepositGuard rules, reminders, payments, branding, and integrations under existing settings conventions.
- [x] 9.6 Ensure accessible states and mobile layouts (keyboard support, labels, contrast, status text not color-only).

## 10. Cross-module integration

- [x] 10.1 Add DepositGuard expected/received cash event outputs consumable by CashPlan forecasting services.
- [x] 10.2 Add DepositGuard digest metrics hooks for Owner's Digest where entitlement and operational state allow.
- [x] 10.3 Add RunwayGuard feed integration points for DepositGuard forecast impact through service-level contracts.
- [x] 10.4 Add in-app notification events for viewed, paid, partial, overdue, failed, and ready-to-start transitions with deep links.

## 11. Testing and validation

- [x] 11.1 Add unit tests for deposit calculations, rounding, outstanding balances, milestone totals, and status transitions.
- [x] 11.2 Add integration tests for RLS isolation, entitlement enforcement, secure-link access, manual payment recording, and reminder deduplication.
- [x] 11.3 Add end-to-end workflow tests covering MVP flows and non-entitled upgrade path behavior.
- [x] 11.4 Run validation commands (`npm run lint`, `npm run test`, type checking, and applicable RLS verification) and record outcomes.

Validation snapshot (2026-09-13):
- `npm run lint`: pass
- `npm run test`: pass (1108 passing)
- `npm run verify-rls`: pass
- `npx tsc --noEmit -p tsconfig.json`: fails on existing baseline issues (`ES2017` target vs BigInt literals; `node:test` module-mock typing mismatch in legacy test files)
- `node --experimental-test-module-mocks --import tsx --test tests/marketing-module-portfolio.test.ts`: pass (3/3)

## 12. Seed data and documentation

- [x] 12.1 Add development-only seed scenarios for draft/awaiting/partial/overdue/paid/milestone DepositGuard states.
- [x] 12.2 Update architecture and data docs (`docs/DDD.md`, relevant module docs) for DepositGuard models, APIs, routes, and integration points.
- [x] 12.3 Update runbook env matrix and operational guide for DepositGuard reminder operations, payment-provider setup, and troubleshooting.
- [x] 12.4 Confirm documentation labels scaffolded or deferred Phase 2 capabilities as planned, not implemented.

## 13. Marketing-site updates

- [x] 13.1 Add DepositGuard to shared marketing module portfolio/navigation surfaces using the canonical catalog pattern.
- [x] 13.2 Create or update DepositGuard marketing destination content with clear module positioning and cross-links to complementary modules.
- [x] 13.3 Update public marketing copy to distinguish implemented MVP behavior from planned Phase 2 integrations and contact-only paths.
- [x] 13.4 Add or update tests/checks validating that marketing module portfolio and claims remain consistent with implementation status.
