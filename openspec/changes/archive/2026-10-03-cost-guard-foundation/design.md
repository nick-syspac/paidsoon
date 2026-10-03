# Design: Cost Guard Foundation

## Context

PaidSoon is already moving toward a financial-operations platform. The current architecture has a shared spend-side foundation, a canonical financial-data direction, and a broader roadmap that includes cash forecasting and owner guidance. Cost Guard is the next logical capability: an early-warning layer that detects when spending is moving outside an owner's expected pattern before it materially damages cash flow.

This design deliberately treats Cost Guard as a deterministic intelligence layer on top of the shared financial dataset, not as an accounting system. The system should help answer five questions quickly:

- Are costs under control?
- What is costing more than expected?
- Is anything unusual?
- What will month-end likely look like?
- What should the owner investigate?

The design is intentionally constrained to the highest-value MVP behaviors: supplier drift, category drift, spend velocity, recurring-cost increases, duplicate or unusual charges, new suppliers, and month-end forecast risk.

## Goals / Non-Goals

### Goals

- Add a read-only Cost Guard capability that sits on the normalized financial layer
- Detect material overruns and unusual cost movement using deterministic rules and historical baselines
- Explain each alert in owner language with why it matters, how much it matters, and what to inspect
- Treat SpendLeak recurring commitments as a first-class input to cost-risk detection
- Keep the module explainable, auditable, and tenant-isolated

### Non-Goals

- Accounting software or AP workflow management
- Purchase-order approval or write-back to provider systems
- Full ERP budgeting capabilities
- LLM-only detection without deterministic thresholds and baselines
- A separate database or ingestion system outside the shared financial intelligence layer

## Decisions

### D1 — Cost Guard is a module, not a product silo

Cost Guard shares the same data model and provider adapters as the rest of the financial-operations platform. It should reuse:

- normalized transaction records
- supplier and category aggregation
- provenance / source metadata
- tenant-scoped access
- recurring spend commitments from SpendLeak

It must not create its own independent ledger or data source model.

### D2 — Baselines are historical and explainable

Cost Guard uses baselines derived from prior windows, especially:

- previous 3 months
- previous 6 months
- previous 12 months
- optionally same period last year for seasonal businesses

The system stores both average and median values. A single extreme charge should not distort the normal range. Every alert should display the baseline used so the user can understand the comparison.

### D3 — Materiality filters are required

The alerting engine only triggers when both percentage variance and dollar variance exceed configured thresholds. This prevents noise from tiny price changes on low-value items.

Example:

- variance > 20%
- absolute variance > $100

Both conditions should be configurable and applied before the alert is surfaced.

### D4 — Alerts are evidence-backed, not vague summaries

Every alert should include:

- title / severity
- what changed
- baseline used
- actual amount and variance
- transactions or suppliers involved
- confidence and materiality metadata
- link to the supporting evidence

This keeps Cost Guard from feeling like a generic analytics panel.

### D5 — All detection is deterministic by default

Cost Guard may later add natural-language explanation via an AI summary layer, but the numbers and alerts must come from calculations, not from the model. Baselines, periods, thresholds, and variances must be persisted and inspectable.

### D6 — SpendLeak and Cost Guard share a cost-control story

SpendLeak identifies recurring waste and likely savings opportunities. Cost Guard identifies when a category, supplier, or spending pattern is moving materially beyond normal years. Together they support a coherent story:

- track cash coming in
- stop waste
- control cost drift

### D7 — Read-only posture for MVP

Cost Guard is initially read-only against provider systems. It does not write back, it does not propose AP workflows, and it does not attempt procurement automation. It is an owner-facing control layer, not an expense-management tool.

## Architecture

```text
Accounting Connector
        ↓
Normalized Financial Data
        ↓
 ┌──────────────┬──────────────┬──────────────┐
 │ Receivables  │ SpendLeak    │ Cost Guard   │
 │ PaidSoon     │ intelligence │ monitoring   │
 └──────────────┴──────────────┴──────────────┘
        ↓              ↓                ↓
    Invoice chase   Recurring waste   Cost risk
    workflows       detection         alerts + forecast
```

The key principle is that Cost Guard consumes the same canonical transaction, supplier, and category data that other financial modules use. It does not own a second financial dataset.

## Data Model Direction

### Core tables

- `cost_guard_settings`
- `cost_guard_rules`
- `cost_guard_baselines`
- `cost_guard_alerts`
- `cost_guard_alert_events`
- `cost_guard_forecasts`
- `cost_guard_budget_lines` (future / second release)
- `cost_guard_exclusions`

### Alert schema

```text
cost_guard_alerts
- id
- tenant_id
- alert_type
- supplier_id
- category_id
- transaction_id
- severity
- score
- confidence
- title
- description
- baseline_amount
- actual_amount
- variance_amount
- variance_percent
- estimated_annual_impact
- status
- detected_at
- acknowledged_at
- resolved_at
- created_at
- updated_at
```

### Rule schema

```text
cost_guard_rules
- id
- tenant_id
- name
- rule_type
- supplier_id
- category_id
- threshold_amount
- threshold_percent
- lookback_period
- severity
- enabled
- created_by
- created_at
- updated_at
```

### Baseline schema

```text
cost_guard_baselines
- id
- tenant_id
- baseline_type
- supplier_id
- category_id
- period
- average_amount
- median_amount
- minimum_amount
- maximum_amount
- transaction_count
- confidence
- calculated_at
```

## Processing Pipeline

```text
Accounting sync
    ↓
Normalize transactions
    ↓
Deduplicate
    ↓
Classify spend
    ↓
Refresh supplier / category profiles
    ↓
Recalculate baselines
    ↓
Apply default + user rules
    ↓
Run anomaly detectors
    ↓
Calculate month-end forecast
    ↓
Create or update alerts
    ↓
Notify / digest / dashboard
```

All processing is idempotent. Re-running an accounting sync must not create duplicate alerts.

## Severity Model

Every alert receives a risk score based on:

- financial impact (40%)
- deviation from normal (25%)
- likelihood of recurring change (20%)
- detection confidence (15%)

Result bands:

- 0–24: Information
- 25–49: Watch
- 50–74: Warning
- 75–100: Critical

Users do not see the formula; they see the label.

## Alert Lifecycle

```text
NEW
 ├─ Acknowledge
 ├─ Expected
 ├─ Snooze
 ├─ Investigating
 ├─ Resolved
 └─ Ignore
```

The owner can mark a risk as expected, snoozed, investigated, or resolved. Each action generates an event in the audit trail.

## MVP Scope

### Included in MVP

- Supplier increase detection
- Category increase detection
- Large or unusual invoice detection
- Possible duplicate detection
- New supplier detection
- Spend velocity detection
- Recurring cost increase detection
- Month-end forecast overspend
- Overview, alerts, supplier drill-down, category drill-down, settings
- Daily warnings and weekly summary digest

### Deferred beyond MVP

- budgets / category limits
- custom operating rules beyond core defaults
- cost-protected savings calculations
- supplier contract renewal guard
- margin guard / payroll guard
- purchase guard
- seasonal forecast sophistication

## Notifications

Notification policy:

- Critical: immediate alert
- Warning: daily digest
- Watch: weekly summary

Example digest summary:

> Cost Guard found 3 things worth checking. AWS is $680 above normal. Marketing is projected $3,400 over target. Adobe recurring price increased from $129 to $179.

## Validation Strategy

- Unit tests verify baseline and threshold logic
- RLS coverage proves tenant isolation for every Cost Guard table
- Re-sync tests prove idempotent processing
- Forecast and alert tests validate exact scenario coverage
- A preview seed exercise proves that ingestion → baseline → detection → alert → digest flow works end to end

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Alert fatigue | Require materiality and variance thresholds |
| False positives on seasonal businesses | Use weighted historical baselines and allow user exclusions |
| Platform sprawl | Keep Cost Guard on shared financial layer |
| Over-optimistic forecast | Keep forecast lightweight and explainable |
| Over-automation | Maintain read-only posture for MVP |

## Validation

This design is valid if Cost Guard can support the following without becoming accounting software:

- show cost-risk summary quickly
- identify unusual supplier and category movement
- explain the basis of the alert
- track the alert lifecycle
- estimate month-end spend and materially above-normal costs
- integrate recurring commitments from SpendLeak

If it does those things, the module adds real value while staying consistent with the paidsoon platform direction.
