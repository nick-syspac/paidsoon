# Tasks

## 1. Shared Foundation and Data Model

- [x] 1.1 Finalize Cost Guard domain model: alert table, baseline table, rules table, settings table, forecast table, and audit event table
- [x] 1.2 Confirm Cost Guard tables reuse normalized transaction, supplier, category, and provenance fields from the shared financial layer
- [x] 1.3 Add `cost_guard_settings`, `cost_guard_rules`, `cost_guard_baselines`, `cost_guard_alerts`, `cost_guard_alert_events`, and `cost_guard_forecasts` to `prisma/schema.prisma`
- [x] 1.4 Add tenant-scoped RLS policies for every Cost Guard table in `prisma/rls-policies.sql`
- [x] 1.5 Create migration SQL for Cost Guard tables and validate idempotent setup behavior
- [x] 1.6 Add default rule definitions to the application startup/config paths or schema defaults
- [x] 1.7 Document the Cost Guard foundation in the DDD / HLD narratives

## 2. Baseline and Forecast Engine

- [x] 2.1 Define baseline windows: 3-month, 6-month, 12-month, and optional same-period-last-year logic
- [x] 2.2 Implement baseline calculation that stores both average and median values
- [x] 2.3 Add confidence scoring for baseline calculations based on sample size and consistency
- [x] 2.4 Implement forecast calculation based on actual spend to date + recurring commitments + expected variable spend remaining
- [x] 2.5 Persist month-end forecast snapshots for comparison and auditability
- [x] 2.6 Expose baseline and forecast outputs to the dashboard summary layer

## 3. Detection Engine

- [x] 3.1 Implement supplier increase detector
- [x] 3.2 Implement category increase detector
- [x] 3.3 Implement spend velocity detector
- [x] 3.4 Implement possible duplicate invoice or duplicate transaction detection
- [x] 3.5 Implement large-unusual invoice detection
- [x] 3.6 Implement new supplier detection with configurable amount threshold
- [x] 3.7 Implement recurring cost increase detection from SpendLeak recurring commitments
- [x] 3.8 Add materiality thresholds based on both percentage deviation and absolute dollar impact
- [x] 3.9 Add confidence scoring per detection result
- [x] 3.10 Ensure all detections are deterministic, explainable, and idempotent

## 4. Rules Engine

- [x] 4.1 Add default rules for supplier increase, category increase, large unusual spend, duplicate spend, new supplier, recurring increase, and forecast overspend
- [x] 4.2 Implement user-configurable rules for supplier limits, category limits, percentage thresholds, and dollar thresholds
- [x] 4.3 Allow rule exclusions for known noisy or seasonal suppliers
- [x] 4.4 Validate rule precedence and conflict-handling behavior
- [x] 4.5 Persist rule changes with audit events

## 5. Alert Lifecycle and Audit Trail

- [x] 5.1 Create `COST_GUARD_ALERT_CREATED`, `COST_GUARD_ALERT_ACKNOWLEDGED`, `COST_GUARD_ALERT_EXPECTED`, `COST_GUARD_ALERT_SNOOZED`, `COST_GUARD_ALERT_RESOLVED`, and `COST_GUARD_RULE_CHANGED` event types
- [x] 5.2 Add lifecycle transitions for new, acknowledged, expected, snoozed, investigating, resolved, and ignored
- [x] 5.3 Persist audit metadata including actor, timestamp, and reason
- [x] 5.4 Expose lifecycle state in the API and dashboard UI
- [x] 5.5 Ensure alert state changes do not create duplicate alert records

## 6. Dashboard and API surfaces

- [x] 6.1 Implement `GET /api/cost-guard/summary`
- [x] 6.2 Implement `GET /api/cost-guard/alerts`
- [x] 6.3 Implement `GET /api/cost-guard/alerts/:id`
- [x] 6.4 Implement `POST /api/cost-guard/alerts/:id/acknowledge`
- [x] 6.5 Implement `POST /api/cost-guard/alerts/:id/resolve`
- [x] 6.6 Implement `POST /api/cost-guard/alerts/:id/snooze`
- [x] 6.7 Implement `POST /api/cost-guard/alerts/:id/expected`
- [x] 6.8 Implement `GET /api/cost-guard/suppliers`
- [x] 6.9 Implement `GET /api/cost-guard/categories`
- [x] 6.10 Implement `GET /api/cost-guard/rules` and `POST /api/cost-guard/rules`
- [x] 6.11 Implement `PATCH /api/cost-guard/rules/:id`
- [x] 6.12 Implement `GET /api/cost-guard/forecast`
- [x] 6.13 Add dashboard cards for spend this month, forecast variance, cost risks, and protected cost value

## 7. Notifications and Digest

- [x] 7.1 Implement critical alerts delivery for immediate attention
- [x] 7.2 Implement daily warning digest aggregation
- [x] 7.3 Implement weekly summary digest aggregation
- [x] 7.4 Ensure alert delivery is deduplicated and respects alert lifecycle state
- [x] 7.5 Add user-friendly summary templates and CTA links to the relevant alert views

## 8. SpendLeak Integration

- [x] 8.1 Consume recurring spend commitments from the SpendLeak data model as expected-cost baselines
- [x] 8.2 Trigger recurring-cost increase alerts when actual recurring spend exceeds baseline by a configured threshold
- [x] 8.3 Support recurring cancellation or reduction events as negative-cost signals in forecast calculations
- [x] 8.4 Keep Cost Guard logic read-only and evidence-based when referencing SpendLeak findings

## 9. Verification and Quality Gates

- [x] 9.1 Add unit tests for baseline calculations, threshold checks, forecast logic, and alert suppression
- [x] 9.2 Add tests proving alert idempotency across repeated sync runs
- [x] 9.3 Add RLS verification for every Cost Guard table and derived query
- [x] 9.4 Validate tenant isolation on supplier, category, and alert data
- [x] 9.5 Run `npm run verify-rls` after schema changes
- [x] 9.6 Run the relevant test suite and confirm no regressions in financial-data or SpendLeak flows

## 10. Docs and Release Readiness

- [x] 10.1 Update `docs/DDD.md` with the Cost Guard domain model and integration points
- [x] 10.2 Update `docs/HLD.md` with the Cost Guard module architecture and roadmap positioning
- [x] 10.3 Add any required runbook entries if new env vars or provider permissions are introduced
- [x] 10.4 Move the change to ready after design, task, and spec validation passes within `openspec`
