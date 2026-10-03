## 1. Domain Model and Persistence

- [x] 1.1 Define Tax Buffer Prisma models for configuration, reserve categories, obligations, snapshots, and overrides
- [x] 1.2 Add relations from user profile and shared financial entities to Tax Buffer models
- [x] 1.3 Generate migration for new Tax Buffer tables and indexes
- [x] 1.4 Add and verify tenant-scoped RLS policies for all Tax Buffer tables in prisma/rls-policies.sql

## 2. Tax Buffer Service and Contracts

- [x] 2.1 Create a Tax Buffer domain service in lib/taxBuffer for reserve, gap, and safe-to-spend calculations
- [x] 2.2 Define typed summary contracts for available cash, total required reserve, total reserved, reserve gap, and health status
- [x] 2.3 Implement category method routing for GST, PAYG withholding, PAYG instalment, income/company tax, and custom categories
- [x] 2.4 Implement confidence, warning, and source-lineage outputs for every category and recommendation

## 3. Calculation Rules and Overrides

- [x] 3.1 Implement GST calculation with cash-basis and accrual-basis behavior toggles
- [x] 3.2 Implement PAYG withholding, PAYG instalment, and income/company tax method variants (fixed, percentage, manual)
- [x] 3.3 Implement custom reserve category calculations with recurrence and due-date support
- [x] 3.4 Implement manual override storage and effective-value resolution with reason, actor, and timestamp

## 4. Data Source Adapters and Fallbacks

- [x] 4.1 Extend normalized accounting input mapping to expose tax-relevant metadata where provider data supports it
- [x] 4.2 Keep Xero- and MYOB-specific tax parsing isolated inside provider adapter layer
- [x] 4.3 Reuse imported invoice/expense/transaction data for fallback estimation where integration data is incomplete
- [x] 4.4 Implement conservative fallback behavior for ambiguous tax treatment with reduced confidence and warnings

## 5. CashPlan and FinOps Composition

- [x] 5.1 Add a shared Tax Buffer summary contract consumable by dashboard and CashPlan surfaces
- [x] 5.2 Integrate Tax Buffer obligations as future commitments in CashPlan-compatible projection paths without duplicating ledger records
- [x] 5.3 Add a safe-to-spend composition helper combining available cash, committed obligations, and tax reserve requirements
- [x] 5.4 Ensure summary values remain consistent across Tax Buffer page, dashboard overview, and CashPlan status outputs

## 6. API Surface and Validation

- [x] 6.1 Add Tax Buffer summary endpoint returning reserve totals, safe-to-spend, health status, and recommendation
- [x] 6.2 Add Tax Buffer obligations endpoint with filtering, sorting, and 30/60/90-day horizon options
- [x] 6.3 Add Tax Buffer settings CRUD endpoints with zod validation and entitlement checks
- [x] 6.4 Add Tax Buffer overrides endpoint(s) with audit metadata capture and conflict-safe updates

## 7. Dashboard and Navigation UI

- [x] 7.1 Add Tax Buffer route group and page layout under dashboard module conventions
- [x] 7.2 Add Tax Buffer entry to dashboard navigation with entitlement-aware visibility
- [x] 7.3 Implement summary cards (available cash, total reserved, reserve gap, safe-to-spend) and health indicator states
- [x] 7.4 Implement category breakdown and upcoming obligations table with explainability and source confidence labels

## 8. Settings and First-Time Setup

- [x] 8.1 Add Tax Buffer settings page under dashboard settings with general/accounting basis controls
- [x] 8.2 Implement category configuration forms for GST, PAYG withholding, PAYG instalments, income/company tax, and custom reserves
- [x] 8.3 Implement reserve account/manual reserve balance configuration path
- [x] 8.4 Implement first-time setup flow with suggested defaults when reliable source data exists

## 9. Notifications and Auditability

- [x] 9.1 Emit Tax Buffer events for under-reserved, recovered, obligation-due-soon, and material reserve-delta states
- [x] 9.2 Integrate Tax Buffer event summaries into existing digest and in-app notification flows
- [x] 9.3 Rate-limit and deduplicate Tax Buffer notifications using existing non-spam patterns
- [x] 9.4 Record Tax Buffer setting changes and overrides in an auditable event trail

## 10. Entitlements, Permissions, and Security

- [x] 10.1 Add Tax Buffer feature keys to subscription feature catalog and plan mappings
- [x] 10.2 Enforce Tax Buffer entitlement checks in API routes and server-rendered dashboard/settings pages
- [x] 10.3 Confirm tenant isolation and no cross-tenant access in Tax Buffer reads, writes, and derived calculations
- [x] 10.4 Add explicit estimate/disclaimer copy in Tax Buffer surfaces to avoid compliance misrepresentation

## 11. Testing and Quality Gates

- [x] 11.1 Add unit tests for category calculations, basis behavior, reserve gap, safe-to-spend, rounding, and missing-data paths
- [x] 11.2 Add integration tests for provider/import source mapping, entitlement gating, and override audit behavior
- [x] 11.3 Add UI tests for Tax Buffer states (loading, empty, stale, unknown, underfunded, critical) and responsive rendering
- [x] 11.4 Run lint, typecheck, targeted test suites, and verify-rls after schema/policy changes

## 12. Documentation and Rollout

- [x] 12.1 Update docs/DDD.md with Tax Buffer domain model, routes, and integration boundaries
- [x] 12.2 Update docs/HLD.md with Tax Buffer position in the PaidSoon FinOps architecture and Safe-to-Spend composition
- [x] 12.3 Add/update Tax Buffer module documentation and runbook env matrix entries where needed
- [x] 12.4 Document deferred items (exports, advanced adviser workflows, deeper historical analytics) and rollout guardrails
