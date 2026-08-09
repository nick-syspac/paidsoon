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
- **MODIFIED** accounting sync architecture so Xero and MYOB imports can collect spend-side data in
  addition to receivables data while remaining read-only against the source systems
- **MODIFIED** public `/roadmap` content so SpendLeak appears as a planned product direction with a
  phased MVP-to-later breakdown

## Capabilities

### New Capabilities

- `spendleak-ingestion`: Pull spend-side accounting data from Xero and MYOB into a normalized,
  read-only SpendLeak model without turning PaidSoon into an accounting package
- `spendleak-insights`: Generate explainable savings and risk findings from imported spend data,
  each with supporting evidence and an estimated impact where possible
- `financial-operations-dashboard`: Present cash coming in, cash going out, and highlighted action
  items in a single operator view
- `spendleak-ai-summary`: Summarize deterministic findings into owner-friendly daily guidance such
  as "where am I wasting money?" or "what should I act on next?"
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
- **Documentation**: Update `docs/HLD.md`, `docs/DDD.md`, and roadmap-facing marketing copy once
  implementation ships
- **Positioning**: Clarify that accounting systems remain the source of truth and SpendLeak is an
  analysis/action layer only