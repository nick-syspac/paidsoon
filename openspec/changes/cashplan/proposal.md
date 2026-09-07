## Why

PaidSoon already helps owners understand what is owed and how to collect it, but it does not yet help them answer the next operational question: can the business safely pay its bills and still protect its runway? Most small businesses are sitting on accounting data, invoice timing, recurring spend, payroll, and tax obligations, yet that information is fragmented across systems and incomplete in the weekly decisions that matter.

CashPlan closes that gap by turning accounting facts and PaidSoon intelligence into a plain-English 13-week cash view that explains the lowest point, the drivers behind it, and the few actions that are most likely to help. This is the right moment to build it because the product already has the payment and spend data model foundation, the subscription and integration architecture, and a clear operational need for a forward-looking planning layer.

## What Changes

- **NEW** CashPlan forecast engine for a tenant-wide 13-week weekly cash view
- **NEW** opening balance, recurring outflow, payroll, tax, and planned-item models with manual overrides and audit trails
- **NEW** scenario modelling for Base, Optimistic, Conservative, and custom plans without mutating imported facts
- **NEW** explainability layer that exposes calculation logic, assumptions, confidence factors, and source lineage for every number
- **NEW** overview, plan, calendar, and data-quality surfaces for weekly owner review and forecast correction
- **NEW** recommendation and alert engine that ranks collection, spend-savings, and timing actions by impact and urgency
- **MODIFIED** dashboard overview to surface CashPlan health, low-point risk, and next actions alongside existing PaidSoon metrics
- **MODIFIED** accounting integration and import flows to normalize balances, receivables, payables, recurring expenses, payroll, and tax obligations into a canonical cash model

## Capabilities

### New Capabilities

- `cashplan-forecasting`: Calculate a deterministic 13-week cash forecast from balances, expected inflows, known outflows, manual adjustments, assumptions, and scenario deltas
- `cashplan-plan-workspace`: Provide a plan workspace with overview, weekly grid, calendar, data-quality queue, and explainability drawer for owner decisions
- `cashplan-actions`: Rank actionable recommendations and alerts using forecast impact, urgency, confidence, and ownership context

### Modified Capabilities

- `dashboard-overview`: Expand the current dashboard to include forward-looking cash health, low-point warnings, and top actions without replacing the receivables-first experience
- `accounting-integrations`: Extend accounting and CSV ingestion to supply the cash facts that CashPlan relies on while preserving immutable source lineage and auditability

## Impact

- **Schema**: New tenant-scoped CashPlan entities for plans, settings, assumptions, snapshots, overrides, scenarios, recommendations, and data-quality issues
- **APIs**: New summary, period, item, override, settings, scenario, explanation, and export endpoints under the CashPlan module
- **Jobs**: Recalculation, source sync, alert evaluation, recommendation generation, digest delivery, and override expiry processing
- **UI**: New CashPlan modules in the dashboard and settings surfaces, plus scenario comparison and explainability interactions
- **Data**: Shared canonical financial facts from PaidSoon, SpendLeak, Cost Guard, and accounting integrations; immutable source records plus auditable overrides
- **Security**: Strong tenant isolation, role-based access, retention policies, and audit logging across every plan action and export
