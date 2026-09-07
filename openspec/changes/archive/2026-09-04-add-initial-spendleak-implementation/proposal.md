## Why

PaidSoon already helps small businesses improve cash collection. The next defensible step is to
help them improve cash retention with the same level of automation and operator clarity.
Xero and MYOB already record what happened across bills, invoices, suppliers, and bank
transactions, but they do not turn that raw accounting history into a practical list of savings
actions for a time-poor owner.

SpendLeak should therefore launch as an AI-assisted financial operations layer on top of Xero and
MYOB, not as a standalone subscription tracker and not as a replacement accounting system. The
initial slice needs to prove three things quickly: we can ingest the right source-of-truth data,
we can generate explainable savings opportunities without manual spreadsheet work, and we can show
cash-in plus cash-out in one daily dashboard alongside PaidSoon.

The public roadmap also needs to reflect this product direction explicitly. Today it only
communicates PaidSoon's receivables roadmap. The `/roadmap` page should introduce SpendLeak as the
planned spend-side companion so the positioning is clear to prospects, early-access users, and
partners.

## What Changes

- **NEW** SpendLeak read-model foundation for bills, supplier contacts, expense accounts, bank
  transactions, and receivables/expense correlation data imported from Xero and MYOB
- **NEW** Spend intelligence engine that produces deterministic, explainable findings for the
  initial insight pack:
  - recurring subscription detection
  - subscription price increase detection
  - duplicate invoice / duplicate payment detection
  - renewal alert detection
  - supplier spend concentration and trend detection
  - initial cash runway / near-term cash pressure forecast
- **NEW** SpendLeak dashboard surfaces showing potential annual savings, flagged subscriptions,
  duplicate payments, upcoming renewals, top suppliers, and cash runway
- **NEW** Combined financial-operations summary that pairs PaidSoon receivables signals with
  SpendLeak payables and savings signals in one business-health view
- **NEW** AI-generated savings summary layer that explains findings and estimated impact using the
  deterministic insight output as evidence
- **NEW** Finding-confidence model and owner review workflow that separates detection from decision,
  supports suppression of legitimate spend, and tracks outcomes from potential to verified savings
- **NEW** Monthly SpendLeak reporting and owner-digest inclusion so savings work is visible,
  measurable, and action-oriented over time
- **MODIFIED** accounting sync architecture so Xero and MYOB imports can collect spend-side data in
  addition to receivables data while remaining read-only against the source systems
- **MODIFIED** public `/roadmap` content so SpendLeak appears as a planned product direction with a
  phased MVP-to-later breakdown

> **Dependency (added 2026-08-31):** Sections 2–5 (sync expansion, detectors, surfaces) consume the
> canonical financial layer introduced by `canonical-financial-data-model`. That change lands first;
> the spend-side foundation tables (`imported_bills`, `imported_bank_transactions`,
> `supplier_profiles`) are aligned to the shared provenance vocabulary (`source_system`, `source_id`,
> `source_updated_at`, `synced_at`) as part of it. Receivables context for the unified cash view now
> reads from the canonical `financial_invoices` rather than `tracked_invoices`.

## MVP Focus (Release 1)

The first release of this change is intentionally constrained to the smallest scope that can produce
immediate, measurable value for owners:

1. CSV/XLSX expense import
2. Xero and MYOB expense synchronization
3. Recurring-payment detection
4. Duplicate-payment detection
5. Supplier price-increase detection
6. Basic owner workflow actions: keep, cancel, renegotiate, ignore

The target launch message is an evidence-backed outcome statement such as:

> "SpendLeak reviewed A$14,800 of recurring annual expenditure and identified A$2,350 worth reviewing."

## Core Findings and Workflow Model

This proposal extends SpendLeak beyond detector output by defining the minimum operational model
required for owners to take action reliably.

- Finding confidence levels:
  - confirmed leak
  - likely leak
  - review recommended
  - normal expense
- Review actions:
  - keep
  - cancel
  - renegotiate
  - downgrade
  - investigate
  - ignore
  - assign to someone
- Finding operations:
  - allow notes, attachments, and supplier contact details
  - set review dates and reminders
  - suppress legitimate expenses to reduce repeated noise
  - learn from prior owner decisions for future prioritization
- Savings realization stages:
  - potential savings
  - approved savings
  - implemented savings
  - verified savings

## Later Features (Explicitly Out of Scope for MVP)

These remain planned follow-on scope and are intentionally excluded from the first release:

- Supplier renewal calendar
- Contract document analysis
- AI-generated cancellation and negotiation emails
- Industry spending benchmarks
- Multi-business accountant dashboard
- Employee expense monitoring
- Supplier consolidation recommendations
- CashPlan forecasting of savings
- CostGuard budget-policy integration
- "What happens if we remove this expense?" scenario simulation

## Product Boundaries

This proposal clarifies role boundaries across financial-operations modules:

- PaidSoon primary role: get outstanding invoices paid
- SpendLeak primary role: find money unnecessarily leaving the business and recover savings
- CostGuard primary role: prevent and control future overspending through policy/limits
- CashPlan primary role: forecast future cash position and decision outcomes

SpendLeak SHALL remain an analysis-and-action layer on top of accounting source data. It SHALL NOT
attempt to replace Xero or MYOB as systems of record.

## Capabilities

### New Capabilities

- `spendleak-ingestion`: Pull spend-side accounting data from Xero and MYOB into a normalized,
  read-only SpendLeak model without turning PaidSoon into an accounting package
- `spendleak-insights`: Generate explainable savings and risk findings from imported spend data,
  each with supporting evidence and an estimated impact where possible
- `spendleak-review-workflow`: Let owners classify findings, schedule follow-up, suppress legitimate
  expenses, and track outcomes through verified savings
- `financial-operations-dashboard`: Present cash coming in, cash going out, and highlighted action
  items in a single operator view
- `spendleak-ai-summary`: Summarize deterministic findings into owner-friendly daily guidance such
  as "where am I wasting money?" or "what should I act on next?"
- `spendleak-reporting`: Produce monthly SpendLeak reporting and include spend findings/actions in
  the owner digest
- `spendleak-roadmap-positioning`: Publicly describe SpendLeak on `/roadmap` as the spend-side
  companion to PaidSoon with clear "planned next" and "later" boundaries

### Modified Capabilities

- `accounting-integrations`: Extend existing Xero/MYOB ingestion beyond accounts receivable so the
  platform can analyze outgoing spend and cash timing
- `dashboard-overview`: Expand the current receivables-centric overview into a broader financial
  operations snapshot where PaidSoon and SpendLeak metrics can coexist without confusing the user

## Impact

- **Schema**: New normalized models for imported bills, imported bank transactions, supplier
  profiles, supplier spend aggregates, insight records, and forecast snapshots; additional sync
  metadata on accounting connections or sync runs as needed
- **Sync**: Existing accounting provider implementations gain bill, payment, contact, account, and
  bank-transaction fetch support plus a spend-focused sync orchestration path
- **API**: New internal routes/actions for SpendLeak sync, insight refresh, and dashboard data
  retrieval; possible user-facing route(s) under `/dashboard` for the SpendLeak or unified FinOps
  view
- **UI**: New dashboard cards, supplier tables, insight panels, and AI summary surfaces; roadmap
  page content update at `/roadmap`
- **Workflow**: New review lifecycle surfaces for confidence labeling, action assignment, reminders,
  suppression controls, and savings-stage progression
- **Reporting**: Monthly SpendLeak report outputs and digest integration for action tracking and
  verified savings visibility
- **Documentation**: Update `docs/HLD.md`, `docs/DDD.md`, and roadmap-facing marketing copy once
  implementation ships
- **Positioning**: Clarify that accounting systems remain the source of truth and SpendLeak is an
  analysis/action layer only