## Why

PaidSoon has strong FinOps modules for cash forecasting, receivables, cost control, commitments, and tax reserves, but it does not yet give owners a single survival answer: how long the business can keep operating before usable cash runs out. RunwayGuard is needed now to convert existing cross-module financial signals into a clear, explainable cash-resilience guardrail with actionable warnings before a cash crisis.

## What Changes

- Add a first-class `RunwayGuard` FinOps module that calculates usable operating cash, projected cash exhaustion date, runway days/months, minimum projected cash, confidence, trend, and status bands.
- Build a reusable RunwayGuard calculation service that prefers `CashPlan` forecast timelines when available and falls back to clearly-labeled estimation paths when data is incomplete.
- Exclude protected cash (including `TaxBuffer` reserves and other protected balances) from usable cash in runway calculations.
- Add runway confidence scoring and explainability based on receivable quality, overdue risk, missing inputs, volatility, and forecast completeness.
- Add configurable runway thresholds and policy-driven status classification (Healthy/Watch/Warning/Critical/Emergency) with tenant-safe defaults.
- Add RunwayGuard dashboard summary card and dedicated RunwayGuard module page with runway headline, timeline, drivers, scenarios, and recommendations.
- Add scenario modelling (Base, Conservative, Stress, Custom) and simulation APIs to answer commitment/revenue/cost delay impact questions.
- Integrate with PaidSoon, CashPlan, SpendLeak, CostGuard, TaxBuffer, CommitGuard, and MarginGuard through explicit interfaces instead of duplicated logic.
- Add runway alerts with transition-aware state handling to avoid duplicate alert spam and support threshold breach/recovery notifications.
- Persist periodic runway snapshots for trend/history and movement-based alerting.
- Enforce server-side plan entitlements, strict tenant isolation, auth boundaries, and Zod input validation for all RunwayGuard APIs.
- Add comprehensive automated tests (calculation, integration, alerts, security, UI states) and update architecture/docs for the new module.

## Capabilities

### New Capabilities
- `runwayguard-foundation`: RunwayGuard domain model, usable cash policy, runway calculation engine, confidence model, and explainable calculation breakdowns.
- `runwayguard-dashboard`: Dashboard summary card and dedicated module page with runway headline, timeline, trend, drivers, and owner-friendly terminology.
- `runwayguard-scenarios`: Base/Conservative/Stress/Custom scenario engine plus reusable simulation APIs for runway impact analysis.
- `runwayguard-alerts-history`: Runway threshold transition alerts, material deterioration/recovery detection, and periodic runway snapshot persistence.
- `runwayguard-integrations`: Cross-module contracts for CashPlan, PaidSoon receivables, TaxBuffer reserves, SpendLeak/CostGuard savings, CommitGuard commitment impact, and MarginGuard forecast adjustments.
- `runwayguard-settings`: RunwayGuard settings for horizon, thresholds, confidence weighting policy, protected cash behavior, and notifications.

### Modified Capabilities
- `dashboard-overview`: Add RunwayGuard summary card and trend signal to the main FinOps dashboard.
- `subscription-plan-tiers`: Add RunwayGuard entitlement mapping and tiered feature access using the existing plan framework.
- `spendleak-finops-foundation`: Expose identified/planned/realised savings semantics for runway-impact interpretation.
- `cost-guard-foundation`: Expose potential savings and cost-change outputs for runway-impact recommendations and driver analysis.
- `implementation-gated-entitlements`: Ensure RunwayGuard UI and APIs are hidden/blocked when feature gates are unavailable.

## Impact

- Affected systems: `lib/` FinOps services, `app/dashboard` module surfaces, `app/api` RunwayGuard endpoints, settings surfaces, alerts/notification flows, test suites, and docs.
- Data model impact: new runway snapshots/alerts/scenario-related persistence (or extension of equivalent existing models), all tenant isolated and RLS compatible.
- Integration impact: RunwayGuard consumes existing module outputs and becomes a shared resilience service used by dashboard, CommitGuard, and MarginGuard.
- Security and governance impact: server-side entitlement checks, authenticated user scoping, RLS-safe data access, validated scenario inputs, and no cross-tenant financial leakage.
- Performance impact: aggregation/snapshot strategy for heavy runway recalculation paths, avoiding expensive recomputation on every render.
