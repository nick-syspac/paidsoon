## Context

PaidSoon already has the core pieces needed to expand into spend intelligence:

- authenticated small-business users
- accounting-provider integrations for Xero and MYOB
- a scheduled/background sync pattern
- dashboard surfaces that already translate raw financial data into daily actions

What is missing is a spend-side read model and an insights layer. Today the product narrative is
mostly "collect money faster". The SpendLeak direction changes that to "improve cash flow from both
ends" by pairing receivables discipline with spend efficiency.

The accounting package remains the source of truth. SpendLeak must never become a ledger,
invoicing product, or accounts-payable system. Its role is to ingest provider data, normalize it,
compute savings/risk opportunities, and explain the next best action.

## Goals / Non-Goals

**Goals**

- Extend Xero and MYOB ingestion to the minimum spend-side dataset required for useful analysis:
  bills, bill payments or payment state, bank transactions, suppliers/contacts, expense accounts,
  and receivables context for cash forecasting
- Ship an initial insight pack that produces concrete, explainable findings without depending on an
  LLM for correctness
- Add a unified financial operations dashboard that shows cash coming in, cash going out, likely
  savings opportunities, and a simple financial-health summary
- Add public roadmap language that introduces SpendLeak as the spend-side companion to PaidSoon and
  explains the phased rollout

**Non-Goals**

- Building a general-ledger or bookkeeping product
- Writing back bills, transactions, or account changes into Xero or MYOB
- Launching the full long-term insight catalog in one release (for example identity-provider usage
  checks, anonymous benchmarking, deep cloud-cost optimization, or generic chat without grounded
  evidence)
- Creating a separate standalone SpendLeak app or authentication system in this first slice

## Decisions

### D1 — Keep accounting providers as the source adapters; add a SpendLeak read model above them

The provider layer should continue to do provider-specific fetch and mapping work. SpendLeak should
not consume raw Xero/MYOB payloads directly from the UI. Instead, sync jobs write normalized
records into SpendLeak-owned tables that preserve source IDs, timestamps, and evidence links.

This keeps provider variability local and gives the insight engine a stable input model.

### D2 — Use deterministic insight detectors first; layer AI explanation on top

The first implementation should not depend on an LLM to decide whether something is wasteful,
duplicated, or rising unusually. Each initial insight should be computed by deterministic logic
with thresholds and evidence payloads, for example:

- recurring-payment clustering by supplier, amount cadence, and account category
- month-over-month price increase detection on recurring suppliers
- duplicate detection by supplier + amount + close date window + document reference heuristics
- renewal prediction from prior annual or fixed-term cadence patterns
- supplier concentration and spend-trend calculations from imported bills and bank transactions
- cash-runway estimate from current cash position, open bills, and expected receivables

AI is then used only to summarize and prioritize these findings for the user.

### D3 — Model insights as persisted findings with evidence and lifecycle state

Insight results should be persisted rather than computed only at page render time. Each finding
needs:

- a stable finding type
- provider/source references
- supporting evidence payload
- estimated monthly or annual impact when calculable
- lifecycle state such as `open`, `dismissed`, `accepted`, or `resolved`

Persisting findings allows the UI to support review workflows, avoid repeated rediscovery noise,
and measure whether the system is creating action.

### D4 — Initial SpendLeak scope covers the first six practical insight families plus unified cash view

The requested long-term SpendLeak vision includes many promising analyses. The initial
implementation should focus on the highest-signal set that can be grounded in the imported data we
already know we can access from Xero and MYOB:

1. recurring subscription detection
2. subscription price increase detection
3. duplicate invoice or duplicate payment detection
4. contract or renewal alert detection
5. supplier spend dashboard and trend detection
6. AI savings recommendations derived from those findings
7. combined cash-flow view with PaidSoon receivables

Features such as login-based unused-license detection, supplier-risk deep analysis, cross-company
benchmarking, and provider-specific cloud optimization remain later roadmap items.

### D5 — Unified financial-operations UI should complement, not replace, the current dashboard

The first UI slice should either add a dedicated SpendLeak destination under `/dashboard` or add a
clear FinOps summary section to the current overview, but it must preserve the existing PaidSoon
chase workflow. Users still come to the product to collect overdue invoices; SpendLeak adds
spend-side visibility without burying the collections path.

The page should expose:

- potential annual savings
- flagged recurring subscriptions
- duplicate payment or invoice alerts
- upcoming renewals
- top suppliers / concentration
- cash runway and next-month cash pressure
- a short AI-generated action summary

### D6 — Roadmap messaging must explain the platform relationship precisely

The roadmap should introduce SpendLeak explicitly as:

- a planned extension of the PaidSoon platform
- an AI financial operations layer on top of Xero and MYOB
- not a replacement for an accounting package

The roadmap should separate initial implementation items from later ideas so the public message is
ambitious but not misleading.

### D7 — Forecasting and savings estimates must remain explainable

Any projected savings or runway figure shown in the first release must expose its main components
through UI drill-down or evidence metadata. A number without traceability will not be trusted.

## Proposed Data Model Direction

The exact Prisma shape can be refined during implementation, but the initial read model should
cover:

- `ImportedBill`: supplier, source document identifiers, amount, GST, due date, paid date, status,
  category/account mapping, source timestamps
- `ImportedBankTransaction`: account, description, amount, transaction date, counterparty hints,
  category/account mapping, source identifiers
- `SupplierProfile`: provider-linked supplier identity, payment terms, ABN, contact details,
  preferred category/account mappings
- `SpendInsight`: finding type, subject key, severity, summary, evidence JSON, estimated impact,
  state, detectedAt, resolvedAt
- `CashForecastSnapshot`: current cash estimate, receivables inflow estimate, payables outflow
  estimate, runway days, assumptions JSON

These models should be linked back to the existing accounting connection and user identity so RLS
remains enforceable for all user-facing reads.

## Rollout Plan

### Phase 1 — Foundation

- extend Xero/MYOB provider fetches for spend-side datasets
- persist normalized bills, bank transactions, suppliers, and forecast inputs
- add sync status and observability for the new data paths

### Phase 2 — Insight Pack

- recurring subscriptions
- price increases
- duplicates
- renewals
- supplier concentration and trend
- first cash runway calculation

### Phase 3 — Product Surfaces

- SpendLeak dashboard or FinOps tab
- AI savings summary
- combined PaidSoon + SpendLeak business-health summary
- roadmap copy update and supporting product messaging

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Provider data quality differs between Xero and MYOB | Normalize minimally, preserve source metadata, and keep provider-specific heuristics isolated in the sync layer |
| Deterministic detectors create noisy findings | Persist finding state, add thresholds and review/dismiss flows, and start with conservative rules |
| Users may confuse SpendLeak with a bookkeeping tool | State clearly in product copy and the roadmap that Xero/MYOB remain the source of truth |
| Cash runway estimates may be over-trusted | Show assumptions and confidence inputs alongside the number |
| LLM summaries could overstate certainty | Restrict AI to summarizing persisted findings and evidence rather than generating new unsupported claims |

## Validation Strategy

- unit tests for provider spend-data mapping and normalization
- unit tests for each detector with positive and negative fixtures
- dashboard tests for mixed PaidSoon + SpendLeak data states
- documentation review so `/roadmap`, `docs/HLD.md`, and `docs/DDD.md` all describe the product direction consistently