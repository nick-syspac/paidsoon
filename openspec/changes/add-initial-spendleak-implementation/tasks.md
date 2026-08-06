# Tasks

## 1. Specification and Data Model

- [ ] 1.1 Finalize the initial SpendLeak scope around recurring subscriptions, price increases,
  duplicates, renewals, supplier spend, AI savings summary, and unified cash view
- [x] 1.2 Add Prisma models for normalized spend-side records and persisted findings, including
  imported bills, imported bank transactions, supplier profiles, spend insights, and forecast
  snapshots
- [x] 1.3 Add or extend RLS policies for all new SpendLeak tables in `prisma/rls-policies.sql`
- [ ] 1.4 Generate a Prisma migration for the SpendLeak foundation schema
- [ ] 1.5 Update `docs/DDD.md` with the new data model and any new user-facing/API surfaces once
  implementation is complete

## 2. Accounting Sync Expansion

- [ ] 2.1 Extend Xero provider support to fetch bills/accounts payable data, supplier/contact
  details, expense accounts, and the minimum bank-transaction inputs needed for initial SpendLeak
  analyses
- [ ] 2.2 Extend MYOB provider support to fetch the equivalent spend-side datasets and normalize
  provider-specific differences
- [ ] 2.3 Add a SpendLeak sync orchestration path that writes normalized spend-side records and
  records sync outcomes without mutating provider data
- [ ] 2.4 Decide whether the new SpendLeak sync runs inside the existing accounting sync cadence or
  as a separate phase with distinct observability, and implement accordingly
- [ ] 2.5 Add tests for provider mapping, sync idempotency, and mixed Xero/MYOB fixture coverage

## 3. Deterministic Insight Engine

- [ ] 3.1 Implement recurring subscription detection using supplier, amount, cadence, and category
  heuristics
- [ ] 3.2 Implement subscription price increase detection across recurring spend history
- [ ] 3.3 Implement duplicate invoice and duplicate payment detection heuristics with evidence
  payloads
- [ ] 3.4 Implement renewal alert detection from annual or fixed-term spend cadence patterns
- [ ] 3.5 Implement supplier concentration and spend-trend calculations
- [ ] 3.6 Implement an initial cash-runway calculation using imported spend data plus PaidSoon
  receivables context
- [ ] 3.7 Persist findings in a `SpendInsight`-style model with evidence, estimated impact, and
  lifecycle state
- [ ] 3.8 Add detector tests covering false-positive boundaries and cross-provider data shapes

## 4. Product Surfaces

- [ ] 4.1 Add a SpendLeak or FinOps dashboard surface under `/dashboard` that presents potential
  savings, renewals, duplicate alerts, supplier concentration, and cash runway
- [ ] 4.2 Add a combined financial-health summary that pairs PaidSoon cash-collection signals with
  SpendLeak cash-out signals
- [ ] 4.3 Add drill-down views or panels so each insight exposes supporting evidence and source
  references
- [ ] 4.4 Add finding lifecycle actions such as dismiss, mark resolved, or snooze if the initial UI
  needs noise control
- [ ] 4.5 Add tests for dashboard rendering across empty, partial-sync, and populated SpendLeak
  states

## 5. AI Savings Summary

- [ ] 5.1 Add an AI summary layer that consumes persisted SpendLeak findings and produces an
  owner-friendly savings summary without inventing unsupported findings
- [ ] 5.2 Define guardrails for estimated savings language, unsupported categories, and confidence
  messaging
- [ ] 5.3 Add tests for prompt grounding and fallback behavior when no findings are available

## 6. Roadmap and Product Messaging

- [x] 6.1 Update `/roadmap` so it introduces SpendLeak as a planned AI financial operations layer on
  top of Xero and MYOB
- [x] 6.2 Add an explicit initial SpendLeak MVP section to `/roadmap` covering recurring
  subscription detection, price increase detection, duplicate detection, renewal alerts, supplier
  spend dashboard, AI savings recommendations, and PaidSoon cash-flow integration
- [x] 6.3 Keep later-stage ideas such as identity-provider usage correlation, vendor benchmarking,
  and deeper supplier-risk analysis clearly labeled as future items
- [x] 6.4 Update `docs/HLD.md` after implementation so the architecture narrative reflects the
  dual-sided financial operations direction accurately without documenting unshipped features as
  implemented

## 7. Verification and Rollout

- [ ] 7.1 Run the focused test suite for new sync logic, detectors, and dashboard surfaces
- [ ] 7.2 Validate that all SpendLeak user-facing reads still go through RLS-safe paths
- [ ] 7.3 Review roadmap and product copy for consistency with actual shipped scope
- [ ] 7.4 Capture any deferred insight families as later follow-up OpenSpec changes rather than
  expanding this initial slice without evidence
