# Cost Guard Foundation Proposal

## Why

PaidSoon is already moving from invoice chasing into a broader financial-operations platform. The repo already documents the direction in [docs/HLD.md](../../docs/HLD.md), the schema has a spend-side foundation in [prisma/schema.prisma](../../prisma/schema.prisma), and the active OpenSpec work around the [canonical financial data model](../canonical-financial-data-model/proposal.md) is establishing the shared financial layer the product needs.

The missing product capability is a cost-control layer that answers a very simple owner question:

> Are my costs under control?

Right now the platform can help collect money owed, and the spend-side foundation can detect wasteful recurring patterns, but it does not yet provide a durable early-warning system for overspending, abnormal supplier behaviour, category drift, or month-end forecast risk.

That gap is the real product opportunity behind Cost Guard:

- detect when spending is rising faster than normal
- explain why the change matters in owner language
- show the relevant transactions and baseline
- surface the risk early enough to act before it damages cash flow
- connect spend-side intelligence with the broader financial-control story

This proposal therefore treats Cost Guard as a natural extension of the existing financial-data foundation, not as a separate accounting product.

## What Changes

- **NEW** Cost Guard capability as a read-only cost-control and early-warning layer for small-business spending
- **NEW** Shared baseline engine for suppliers, categories, recurring commitments, and month-end forecasts
- **NEW** Alerting model for material cost anomalies, supplier drift, recurring expense increases, duplicate or unusual invoices, and spend velocity
- **NEW** Rules engine that can express thresholds by supplier, category, percentage change, dollar value, recurring-cost change, new supplier, and forecast variance
- **MODIFIED** Cost Guard builds on the existing SpendLeak foundation and the canonical financial-data model rather than creating a second financial subsystem
- **MODIFIED** The platform's owner-facing dashboard becomes the place where receivables, spend signals, and cost alerts are viewed together
- **MODIFIED** Cost Guard remains deterministic and explainable: numbers and baselines come from stored calculations, not from an opaque LLM

### Explicitly in scope

- Cost Guard overview with summary cards and risk view
- Alert list, alert detail, severity, and lifecycle states
- Supplier and category drill-downs
- Baseline calculation for recent historical periods
- Forecasting based on actual-to-date + known recurring commitments + expected variable spend
- Default rules for common cost-control scenarios
- Owner-facing explanations: what changed, how much it matters, and what to review
- Integration with SpendLeak recurring commitments so costs and subscriptions are tracked together

### Explicitly out of scope

- Accounting software
- AP / procurement workflow management
- Purchase-order software
- Expense approval or write-back to provider systems
- Full ERP or budget-authoring features
- LLM-only detection without deterministic calculations
- Building a separate financial database outside the shared financial-intelligence layer

## Capabilities

### New Capabilities

- `cost-guard-overview`: summary cards for spend this month, forecast, cost risks, and protected value
- `cost-guard-alerts`: create, update, review, and resolve cost alerts
- `cost-guard-baselines`: calculate supplier/category/recurring baseline behaviour over recent periods
- `cost-guard-rules`: user-configurable or default threshold rules without requiring accounting knowledge
- `cost-guard-forecast`: month-end projection based on actuals and known commitments
- `cost-guard-audit`: retain policy, alert, or rule lifecycle events for review

### Modified Capabilities

- `spendleak-finops-foundation`: reuse the shared financial data, canonical provenance vocabulary, and normalized spend records instead of duplicating data model patterns
- `dashboard-overview`: present receivables, SpendLeak, and Cost Guard signals as one financial-control view
- `accounting-integrations`: continue as source-only read integrations; Cost Guard remains read-only against Xero, MYOB, and CSV-based imports
- `customer- and supplier-views`: add cost-aware supplier and category drilldowns driven by the shared financial layer rather than bespoke provider tables

## Impact

- **Schema**: New `cost_guard_*` tables for alerts, baselines, forecasts, rules, and settings
- **Financial model reuse**: Cost Guard consumes the shared financial transaction / supplier / category layer rather than creating a parallel spend ledger
- **Normalization**: transactions, suppliers, categories, and recurring commitments are classified and deduplicated before thresholds are evaluated
- **Rules and thresholds**: default detection rules are active immediately, with user-configurable overrides and exclusions
- **Notification model**: digest-based alerts for warnings and weekly summaries, with critical issues surfaced immediately
- **Tenant isolation**: all tables, views, and rule evaluations remain tenant-scoped under Supabase RLS; no cross-tenant aggregation is allowed
- **Auditability**: alert creation, acknowledgements, expected state changes, resolve actions, and rule updates are retained as events
- **Read-only posture**: Cost Guard does not write back to accounting systems and does not become an AP or procurement workflow system

## Design Principles

### 1. Explainable, not magical

Cost Guard should tell the owner:

- what changed
- how much it matters
- why it is unusual
- what to review
- which transactions or suppliers contributed

It must never feel like a black box.

### 2. Deterministic detection first

The core detection engine is rule-based and statistical:

- threshold checks
- absolute variance checks
- historical average / median comparisons
- spend velocity comparisons
- recurring commitment comparisons
- forecast variance comparison

LLM assistance may improve explanation, but it should not be the source of truth for the underlying alert.

### 3. Materiality matters more than noise

The system should suppress low-value alerts by requiring both a percentage deviation and meaningful dollar impact. The design intentionally rejects the idea of alerting on every tiny fluctuation.

### 4. Shared data, shared platform

Cost Guard must not become a separate product with independent suppliers or ledger tables. It should be one module in the same financial-intelligence platform as PaidSoon and SpendLeak.

## Proposed MVP Scope

The first release should focus on the highest-value signals with the least implementation risk.

### Data included

- Xero
- MYOB
- Normalized expense dataset

### Detection included

- supplier increase
- category increase
- large or unusual invoice
- possible duplicate
- new supplier
- spend velocity
- recurring cost increase
- month-end forecast overrun

### User-facing surfaces included

- Cost Guard overview
- alert list
- alert details
- supplier drill-down
- category drill-down
- basic rules
- settings

### Notifications included

- critical alerts
- daily warning digest
- weekly summary

## Dependencies and Sequencing

This proposal depends on the shared financial-data direction already being advanced in the repo, especially:

- [openspec/changes/canonical-financial-data-model/proposal.md](../canonical-financial-data-model/proposal.md)
- [openspec/changes/archive/2026-09-04-add-initial-spendleak-implementation/proposal.md](../archive/2026-09-04-add-initial-spendleak-implementation/proposal.md)
- [prisma/schema.prisma](../../prisma/schema.prisma)

The design explicitly assumes that the financial-data hub is built before Cost Guard is expanded into complex dashboards or forecasting features. This is the right sequencing: the product becomes a coherent platform rather than a collection of isolated modules.

## Risks and Trade-offs

### Risk: alert fatigue

Mitigation: threshold both on percentage change and dollar impact, require confidence / materiality filtering, and group by supplier or category where appropriate.

### Risk: data drift across providers

Mitigation: normalize before alerting; deduplicate before classification; keep source provenance on each record;
only compare after normalisation.

### Risk: false sense of accounting accuracy

Mitigation: keep the product as an intelligence layer, not an accounting system; show the basis of comparison; never hide the baseline context.

### Risk: too much scope too early

Mitigation: MVP intentionally excludes budgets, purchase guard, margin guard, and advanced forecasting. Those can be layered later once the foundation is proven.

## Success Criteria

Cost Guard is successful when a business owner can open PaidSoon and answer, in under a minute:

- Are my costs under control?
- What is costing me more than expected?
- Is anything unusual?
- What will my costs probably be by month end?
- What should I investigate?
- How much money has PaidSoon helped me protect?

If the module does those six things well, it becomes a genuine financial early-warning layer.

## Decision Summary

This proposal intentionally positions Cost Guard as the third pillar of PaidSoon's financial-control story:

- PaidSoon: get money in
- SpendLeak: stop wasteful recurring spend
- Cost Guard: control cost drift before it damages cash flow

The underlying architecture should remain shared, normalized, and deterministic. That is the direction most compatible with the repo's current platform evolution.
