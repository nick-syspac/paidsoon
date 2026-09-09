## 1. Domain Model And Persistence

- [x] 1.1 Add RunwayGuard persistence models (snapshots, alerts state/history, settings, optional scenario assumptions) with tenant isolation and migration.
- [x] 1.2 Add or update database indexes needed for runway aggregation queries and threshold transition lookups.
- [x] 1.3 Update RLS policies and tenant-scoping access paths for new RunwayGuard entities.
- [x] 1.4 Add typed domain contracts for runway inputs, outputs, confidence reasons, status bands, and simulation responses.

## 2. Core Runway Calculation Engine

- [x] 2.1 Implement usable cash calculation that excludes TaxBuffer reserves, protected balances, and near-term commitments.
- [x] 2.2 Integrate CashPlan timeline ingestion as primary runway calculation source for configured horizons.
- [x] 2.3 Implement fallback estimate path for missing CashPlan data with explicit low-confidence labeling.
- [x] 2.4 Implement status policy classification using centralized threshold configuration (no scattered constants).
- [x] 2.5 Implement confidence scoring and reason generation using inflow reliability, overdue risk, volatility, and missing-data signals.
- [x] 2.6 Implement explainability payloads (inputs, deductions, assumptions, projected minima, exhaustion point).

## 3. Cross-Module Integrations

- [ ] 3.1 Add PaidSoon receivables adapter to weight expected inflows by due status, overdue age, dispute state, and payment reliability signals.
- [ ] 3.2 Add TaxBuffer adapter so protected tax reserves are always excluded unless explicit policy override exists.
- [ ] 3.3 Add SpendLeak and CostGuard adapters for identified/planned/realized savings classification and runway impact estimates.
- [ ] 3.4 Add CommitGuard-to-RunwayGuard impact API for commitment pre-approval before/after runway comparisons.
- [ ] 3.5 Add MarginGuard forecast-adjustment adapter so margin deterioration can alter runway assumptions without duplicated margin logic.

## 4. Scenario And Simulation Services

- [x] 4.1 Implement scenario presets (Base, Conservative, Stress) with policy-defined assumption multipliers.
- [x] 4.2 Implement custom scenario input schema validation and bounded adjustment rules.
- [x] 4.3 Implement reusable simulation operations returning impact_on_runway_days, impact_on_minimum_cash, new_cash_out_date, and new_runway_status.
- [x] 4.4 Add estimate disclaimers and assumption summaries in all scenario responses.

## 5. Alerts, History, And Background Processing

- [x] 5.1 Implement transition-aware threshold alert evaluator for breach and recovery events.
- [x] 5.2 Implement material-change alert logic (percent decline and commitment-driven day-loss events) with deduplication.
- [ ] 5.3 Wire runway snapshot generation into existing scheduler/worker infrastructure with idempotency protections.
- [ ] 5.4 Implement runway trend computation from snapshot history for dashboard and module views.

- [x] Service composition: combine summary, scenario, and alert outputs in a reusable RunwayGuard service API for app-level consumption.

## 6. API Surface And Security

- [ ] 6.1 Add RunwayGuard read endpoints for headline metrics, timeline data, drivers, confidence reasons, recommendations, and history.
- [ ] 6.2 Add RunwayGuard write endpoints for settings and custom scenario execution where persistence is allowed.
- [ ] 6.3 Enforce server-side auth, tenant derivation from authenticated user, and plan entitlement checks on every endpoint.
- [ ] 6.4 Add request/response validation and safe financial response mapping for all RunwayGuard routes.

## 7. Dashboard, Module UI, And Settings UI

- [x] 7.1 Add RunwayGuard summary card to FinOps dashboard with runway value, status, confidence, usable/protected cash, and 30-day trend delta.
- [ ] 7.2 Add RunwayGuard navigation entry and module page layout aligned with existing PaidSoon UI conventions.
- [ ] 7.3 Implement module headline section (days, months, cash-out date, status, confidence, usable/protected cash, minimum projected cash).
- [ ] 7.4 Implement timeline visualization with zero-cash line, warning markers, key events, and horizon switching.
- [ ] 7.5 Implement runway drivers and recommendation sections with clear factual vs estimated language.
- [ ] 7.6 Implement scenario comparison and custom controls with immediate recalculation feedback.
- [ ] 7.7 Add RunwayGuard settings section (enablement, horizon, thresholds, confidence weighting, notifications) with entitlement-aware controls.
- [ ] 7.8 Implement loading, empty, and degraded-data UI states including setup guidance for missing integrations.

## 8. Entitlements And Plan Mapping

- [x] 8.1 Map RunwayGuard feature slices to existing subscription plan architecture and feature flags.
- [x] 8.2 Enforce implementation-gated entitlements across RunwayGuard pages, APIs, and advanced controls.
- [x] 8.3 Add plan-aware horizon and scenario feature limits in both UI affordances and API authorization.

## 9. Automated Tests

- [x] 9.1 Add unit tests for runway calculations (positive runway, negative usable cash, sustainable horizon, protected cash exclusion, confidence weighting, missing-data paths).
- [x] 9.2 Add unit tests for scenario engine and simulation delta outputs.
- [x] 9.3 Add integration tests for PaidSoon, CashPlan, TaxBuffer, SpendLeak, CostGuard, CommitGuard, and MarginGuard adapters.
- [x] 9.4 Add alert tests for threshold entry/exit, multi-threshold drops, deduplication, material decline, and recovery.
- [x] 9.5 Add security tests for unauthorized access, cross-tenant isolation, and entitlement enforcement.
- [x] 9.6 Add UI tests for dashboard card rendering, module states, scenario switching, timeline rendering, and responsive layouts.

## 10. Documentation And Validation

- [x] 10.1 Add module documentation for RunwayGuard purpose, formulas, assumptions, confidence model, scenarios, alerts, settings, and limitations.
- [x] 10.2 Update architecture and feature docs (DDD/HLD/module index/feature matrix/navigation) to include RunwayGuard.
- [x] 10.3 Update pricing/entitlement documentation to reflect RunwayGuard feature exposure by plan.
- [x] 10.4 Update environment/runbook docs if new configuration keys are introduced.
- [x] 10.5 Run and record validation steps (lint, typecheck, tests, build) and capture outcomes in implementation report.
