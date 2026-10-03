## Why

PaidSoon already helps users chase receivables, control spend, forecast cash, and manage commitments, but it does not yet provide a trustworthy view of whether revenue is translating into acceptable profit margins. Margin erosion can stay hidden until it becomes a cash-flow issue, so MarginGuard is needed now as a first-class FinOps module that surfaces profitability, confidence/completeness, and actionable interventions using canonical financial data.

## What Changes

- Add a new first-class `MarginGuard` FinOps module in dashboard navigation and module settings navigation, gated by subscription entitlements.
- Introduce a MarginGuard domain model and calculation layer for gross profit, gross margin, contribution margin (when data is sufficient), target variance, margin status, data completeness/confidence, and scenario calculations.
- Add margin target configuration (organisation defaults with scoped overrides) and deterministic threshold validation (`critical < warning < target`).
- Add cost classification metadata and classification rule support that references canonical expense/transaction records (no expense duplication), including manual override precedence and auditability.
- Add MarginGuard summary, trends, breakdowns, customer profitability, and explainable insights views with first-use empty states and onboarding guidance.
- Add configurable margin alerts with severity derived from settings/thresholds, plus lifecycle actions (view, acknowledge, resolve, dismiss) and event history.
- Add background recalculation/evaluation workflows (snapshots, alerts, opportunities, rule application previews) using existing scheduling/worker conventions.
- Add MarginGuard API routes following existing auth, RLS, Zod validation, and response-shaping conventions.
- Integrate with existing PaidSoon, SpendLeak, CostGuard, CommitGuard, CashPlan, and Tax Buffer boundaries through shared canonical data and explicit interfaces.
- Add export/report support where existing export infrastructure supports MarginGuard artifacts and entitlement gates.
- Add comprehensive unit, API/security, and UI/integration tests for formulas, data completeness confidence, tenant isolation, permissions, and entitlement enforcement.
- Update architecture and feature documentation to include MarginGuard behavior, limits, formulas, settings, security model, and known assumptions.

## Capabilities

### New Capabilities
- `marginguard-foundation`: MarginGuard domain model, canonical data mapping, and deterministic calculation engine with completeness/confidence scoring.
- `marginguard-settings`: MarginGuard settings, margin targets, threshold validation, alert preferences, and data-source visibility under existing settings architecture.
- `marginguard-cost-classification`: Direct/variable/overhead/excluded classification metadata and rules with priority, preview, manual override precedence, and audit events.
- `marginguard-dashboard`: MarginGuard dashboard with KPI cards, trends, breakdowns, customer profitability, explainability, and mobile-accessible status semantics.
- `marginguard-alerts-opportunities`: Threshold-based alerts, deterioration detection, margin-at-risk/opportunity estimation, and alert lifecycle actions.
- `marginguard-scenarios`: Price-to-target and cost-change scenario modeling endpoints and UI flows with reusable calculation functions.
- `marginguard-integrations`: Cross-module data contracts for PaidSoon/SpendLeak/CostGuard/CashPlan/CommitGuard/Tax Buffer and FinOps dashboard summary integration.
- `marginguard-background-processing`: Snapshot generation, alert evaluation, rule processing, idempotency/retry behavior, and observability hooks.

### Modified Capabilities
- `dashboard-overview`: Add concise MarginGuard summary card block to the main FinOps dashboard.
- `subscription-plan-tiers`: Add MarginGuard feature entitlements and tiered capability gating in the existing plan catalog.
- `settings-import-export`: Extend existing export/import settings and report surfaces to include MarginGuard-supported outputs where applicable.
- `spendleak-finops-foundation`: Clarify and enforce shared canonical spend/cost semantics consumed by MarginGuard.
- `cost-guard-foundation`: Expose/reuse cost category and cost intelligence outputs for MarginGuard analysis without duplicating data ownership.
- `chase-volume-entitlement`: No behavior change to chase-volume logic, but document interaction where MarginGuard uses invoice/payment outcomes for profitability context.

## Impact

- Affected systems: `app/dashboard`, `components/dashboard`, `app/dashboard/settings`, `app/api`, `lib/*` (billing, financial, settings, integrations, module domain), `prisma/schema.prisma`, `prisma/rls-policies.sql`, cron/worker paths, tests, and docs.
- Security/tenancy: New MarginGuard records and endpoints must use existing user scoping and RLS transaction context patterns; no parallel auth/permission system.
- Performance: Margin trends and deterioration checks require snapshot/aggregate strategies to avoid request-time full-history scans.
- Data contracts: MarginGuard must read canonical invoice/payment/expense/contact data and write only MarginGuard-specific metadata, states, and events.
- Subscription impact: MarginGuard access and advanced capabilities must be centrally entitlement-gated via existing plan feature architecture.
