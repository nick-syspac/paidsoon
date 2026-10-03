## 1. Discovery And Contracts

- [x] 1.1 Finalize MarginGuard capability boundaries against existing module contracts and record any required clarifications for snapshot cadence, product/service grouping source, and alert inbox scope.
- [x] 1.2 Confirm canonical data sources for MarginGuard revenue/cost/payment inputs (FinancialInvoice, FinancialPayment, spend import/bill sources, CostGuard/SpendLeak category semantics).
- [x] 1.3 Define MarginGuard API response DTO contracts (summary, trends, breakdowns, customers, alerts, settings, classifications, scenarios) and align them with existing frontend consumption patterns.

## 2. Schema And RLS

- [x] 2.1 Add MarginGuard Prisma models for settings, targets/overrides, cost classifications, classification rules, alerts, alert events, snapshots, scenarios, and opportunities.
- [x] 2.2 Add required relations and uniqueness constraints so MarginGuard references canonical financial entities without duplicating source transaction records.
- [x] 2.3 Generate Prisma migration and update prisma/rls-policies.sql with tenant-scoped policies for every new MarginGuard table.
- [x] 2.4 Validate migration from a clean database state and run RLS verification to confirm cross-tenant isolation remains intact.

## 3. Calculation Engine

- [x] 3.1 Implement MarginGuard domain calculation functions for gross profit, gross margin, contribution margin, target variance, required price, scenario impact, and status determination.
- [x] 3.2 Implement deterministic data completeness scoring and confidence-state mapping with explicit handling for insufficient inputs.
- [x] 3.3 Implement numeric guardrails for divide-by-zero, negative/credit values, null fields, and invalid target margins.

## 4. Cost Classification Domain

- [x] 4.1 Implement classification metadata persistence for canonical cost records with allowed classes DIRECT_COST, VARIABLE_COST, OVERHEAD, EXCLUDED, and UNCLASSIFIED.
- [x] 4.2 Implement rule evaluation with priority ordering, active/inactive controls, preview mode, and deterministic application outputs.
- [x] 4.3 Implement precedence logic so explicit manual classifications override automatic rule outcomes unless manually changed.
- [x] 4.4 Implement classification and rule audit event recording with actor, timestamp, old value, and new value.

## 5. Entitlements, Permissions, And Navigation

- [x] 5.1 Add MarginGuard feature flags and tier capability mapping to the subscription plan catalog using existing central entitlement architecture.
- [x] 5.2 Add MarginGuard module entry to dashboard navigation with entitlement-gated visibility.
- [x] 5.3 Add MarginGuard group/items to settings navigation with entitlement-gated access and upgrade messaging consistency.
- [x] 5.4 Apply permission checks for view/manage/configure/classify/export capabilities using existing authorization patterns.

## 6. MarginGuard API Routes

- [x] 6.1 Implement authenticated, Zod-validated summary and trends endpoints with RLS-scoped data access.
- [x] 6.2 Implement authenticated breakdown/customer profitability endpoints with target variance, status, and completeness metadata.
- [x] 6.3 Implement settings and target endpoints (read/update) with threshold validation and inheritance behavior.
- [x] 6.4 Implement classification and rule endpoints for list/update/preview/apply flows with audit logging.
- [x] 6.5 Implement alerts endpoints including lifecycle actions (acknowledge, resolve, dismiss) and event history retrieval.
- [x] 6.6 Implement scenario endpoint for price-to-target and cost-change modeling with deterministic outputs and validation errors.

## 7. Dashboard And Module UI

- [x] 7.1 Build MarginGuard dashboard page with summary cards (gross margin, gross profit, margin at risk, customers below target, alerts, data completeness).
- [x] 7.2 Implement trend chart with supported periods, comparison mode where applicable, and target line rendering.
- [x] 7.3 Implement breakdown table views (customer, product/service, category, invoice, job/project when available) with accessible status semantics.
- [x] 7.4 Implement customer profitability view combining profitability and payment behavior context where available.
- [x] 7.5 Implement insights section with traceable evidence, assumptions display, and deterministic recommendation phrasing.
- [x] 7.6 Implement high-quality empty states and lightweight onboarding actions for first-use setup.

## 8. Settings UI

- [x] 8.1 Build MarginGuard general settings screen (enablement, default period, default target and thresholds).
- [x] 8.2 Build margin target settings UI for organization defaults and scoped overrides with inheritance visibility.
- [x] 8.3 Build cost classification settings UI for transaction/category/supplier/recurring classification and bulk update actions.
- [x] 8.4 Build alert and notification settings UI using existing notification preference architecture.
- [x] 8.5 Build data-sources status panel showing connection state, last sync, data range, and sync errors via existing integration status pathways.

## 9. Alerts, Opportunities, And Background Processing

- [x] 9.1 Implement snapshot generation workflow with idempotent tenant-period upserts and observability logs.
- [x] 9.2 Implement alert evaluation workflow for below-target, critical, deterioration, negative-margin, cost-increase, and data-quality conditions.
- [x] 9.3 Implement opportunity generation workflow with issue, evidence, estimated impact, action recommendation, and confidence fields.
- [x] 9.4 Wire jobs into existing scheduler/worker infrastructure with retry-safe behavior and secure cron/worker invocation patterns.

## 10. Cross-Module Integration

- [x] 10.1 Add concise MarginGuard summary integration to main FinOps dashboard overview composition.
- [x] 10.2 Integrate SpendLeak removable-spend signals and CostGuard drift signals into MarginGuard impact/opportunity calculations where basis is explicit.
- [x] 10.3 Add CommitGuard commitment context and CashPlan scenario handoff interfaces without treating commitments as realized current costs.
- [x] 10.4 Preserve Tax Buffer separation by excluding tax reserve concepts from direct operating margin unless explicitly configured.

## 11. Export, Seed, And Documentation

- [x] 11.1 Extend existing export/report infrastructure to include MarginGuard datasets (CSV/XLSX where supported) with entitlement checks.
- [x] 11.2 Update development/preview seed data to include healthy/watch/critical customer margin cases, deterioration trend, unclassified costs, and actionable opportunities.
- [x] 11.3 Update docs/DDD.md, docs/HLD.md, runbooks, and module inventory language to reflect implemented MarginGuard architecture and behavior.

## 12. Testing And Release Verification

- [x] 12.1 Add unit tests for formulas, edge cases, completeness/confidence, classification precedence, and scenario calculations.
- [x] 12.2 Add API/security tests for tenant isolation, authz/entitlement enforcement, validation errors, and alert lifecycle flows.
- [x] 12.3 Add UI/integration tests for key user journeys (view summary, set target, classify cost, review customer profitability, acknowledge alert, run scenario).
- [x] 12.4 Run lint, typecheck, build, full test suite, migration-from-clean verification, and repository scans for TODO/FIXME/placeholder regressions.
- [x] 12.5 Produce final implementation report covering modified components, migrations, routes, jobs, permissions, entitlements, tests, docs, limitations, and next improvements.
