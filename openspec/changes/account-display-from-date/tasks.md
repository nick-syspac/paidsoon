# Tasks

Implementation has not begun. Follow the two capability deltas and design decisions 1–10. All code, migrations, and database execution require a subsequent apply request. Keep account editing unexposed until every active reader/writer and dispatch path is policy-aware. Each group lands its own tests and documentation; final checks are integration-only.

## 1. Tenant storage and atomic audit

- [ ] 1.1 Add the setting/audit models and nullable derived-output provenance columns enumerated in design decisions 1, 2, and 8; generate a new migration only against an explicitly isolated development/shadow database and verify Prisma generation/validation and absent-row compatibility. Do not edit historical migrations or apply pending migrations to shared databases.
- [ ] 1.2 Add narrowly scoped feature SQL and matching canonical RLS for settings ownership, column grants, nonnegative revision/date constraints, and immutable audit reads; verify own/cross-tenant and anonymous grants with real isolated PostgreSQL and confirm profile billing ACLs remain unchanged.
- [ ] 1.3 Implement the private hardened BEFORE/AFTER trigger for revision assignment and atomic audit, including no-op and losing INSERT behavior; verify direct authenticated writes, forbidden actor/revision/audit tampering, private function EXECUTE restrictions, and audit-failure rollback in isolated PostgreSQL.
- [ ] 1.4 Extend RLS verification with independent concurrent connections for first-insert and existing-row races, stale no-op rejection, exact audit counts, and immutable ownership; run against isolated credentials and record results rather than treating mocks as security proof.
- [ ] 1.5 Document the planned models, grants/trigger installation order, review gates, and no-shared-migration rule in architecture/deployment documentation, clearly labeled planned until merged; verify documentation matches the generated schema and SQL.

## 2. Shared policy and temporal contracts

- [ ] 2.1 Implement the immutable transaction-aware policy resolver and typed context from design decision 4; unit-test absent row as null/revision zero with no write, retained revision after clear, request-local reuse, and read failures that never default to null.
- [ ] 2.2 Implement strict real-date validation, canonical serialization, date-only comparisons, Melbourne timestamp conversion, and filter intersection; add shared JSON test vectors for null/equality/leap years/low years/future dates/DST and verify TypeScript results including the documented July midnight boundary.
- [ ] 2.3 Implement typed source predicates/projections for the complete decision-5 mapping, including issue-date fallback, bill due/paid dates, child inheritance, and timestamp events; test missing dates and recent imports never substitute creation time.
- [ ] 2.4 Add provenance validation and a quality envelope for complete/partial/insufficient-data results, with revision in cache/input keys; test unmarked revision-zero compatibility, rejection after clear, mismatched metadata, and unavailable values distinct from true zero.
- [ ] 2.5 Document fixed timezone, date proxies, period cash versus settlement, and effective-range/quality semantics beside the relevant architecture contracts; verify examples against shared vectors and tests.

## 3. Versioned account API and independent draft

- [x] 3.1 Add authenticated private/non-cacheable GET/PATCH `/api/settings/account` using strict Zod validation and `withUserContext`; route-test canonical safe responses, no GET writes, invalid JSON/dates/keys/revision as 400, unauthenticated 401, and sanitized failures as 500.
- [ ] 3.2 Implement expected-revision mutation with row locking and conflict-do-nothing first insert as design decision 2 specifies; route-test 409/no-op semantics and verify the full two-request race with real isolated PostgreSQL, including one atomic audit per winner.
- [x] 3.3 Extend the account page/client with separate date Save/Clear/Reset, `en-AU` presentation, combined dirty guard, duplicate-submit protection, retained failure/conflict drafts, and explicit reload/review; test independence from profile saving and unchanged profile API behavior.
- [ ] 3.4 Add retention/automation/customer-link warnings and successful-save refresh behavior, while keeping editing gated until rollout approval; verify keyboard/accessibility, future date entry, failed-save state, and multi-tab conflict behavior with stubbed browser/API interactions.
- [ ] 3.5 Add the account endpoint contract and settings instructions to API/user documentation, including the distinction between Clear draft and Save, expected revision, and provider-link limits; verify examples match route tests and remain marked planned until merged.

## 4. Receivables and dashboard coverage

- [ ] 4.1 Apply policy before pagination/aggregation in invoice loaders, overview metrics/risk/attention services, and active/resolved lists; test issue-date fallback, filtered overview severities/click-through, untouched-null compatibility, and unchanged chase-allowance consumption/entitlements.
- [ ] 4.2 Gate invoice details, mutation routes, customer-linked invoice subsets, promises/arrangements, evidence, and CSV/XLSX export query paths; test excluded/cross-tenant records, bulk operations, wide export filters, and no business payload in 404 responses.
- [ ] 4.3 Separate period receipts from invoice eligibility while preserving complete-ledger outstanding calculations and existing source deduplication; test old invoice/later payment, eligible invoice/earlier payment, credit/refund effects, and import-reconciliation mirrors counted once.
- [ ] 4.4 Render quality-aware overview metrics and cutoff-aware navigation without fake healthy zeroes; add summary/list/export regression fixtures and document the reporting-versus-billing distinction in user guidance.

## 5. SpendLeak and CostGuard

- [ ] 5.1 Pass policy through SpendLeak loaders, source/classification adapters, detection, finding persistence, and evidence/drilldown routes; test bill due-date versus bank transaction-date mappings, missing dates, and exclusion before ranking/pagination.
- [ ] 5.2 Version SpendInsight owners and require eligible evidence for current findings, including review actions and exports; test stale/unmarked findings after set/change/clear and preserve review history without relabeling old evidence as current.
- [ ] 5.3 Apply policy to CostGuard samples, baselines, alert/forecast writers and readers; test cutoff-crossing baseline windows, existing sample minima, stale alert rejection, and no misleading variance/healthy forecast when inputs are insufficient.
- [ ] 5.4 Add partial-range/insufficient-data presentation to spend/cost dashboards and exports; verify range labels and unavailable amounts in tests and update module guidance with date-proxy limitations.

## 6. CommitGuard CashPlan and Tax Buffer

- [ ] 6.1 Pass one policy through CommitGuard cashContextLoader and CashPlan inputLoader/factLoader/assemblers; test valid current dated balance anchors, absent/pre-cutoff anchors, unchanged setup access, and no fabricated opening balances or double-added flows.
- [ ] 6.2 Filter generated recurring occurrences and CommitmentCoverage by occurrence date, not setup date; test old recurring starts/future occurrences, one-off missing dates, due/renewal calculations, and eligible target coverage without double counting.
- [ ] 6.3 Apply policy and provenance to CommitGuard detection candidates, evaluation state, review/evidence/mutation paths, CashPlan snapshots/scenarios/alerts/quality issues, and queued work; test current-versus-stale revision output and filtered detail/export/calendar paths.
- [ ] 6.4 Apply Tax Buffer due-date gating plus source-period completeness to obligation estimates, category inputs, snapshots, reserve summaries, and dependent safe-to-spend; test future manual obligations retained, truncated estimates unavailable, and incomplete reserve never treated as zero liability.
- [ ] 6.5 Add explicit quality/range UI and API DTOs for dependent cash/forecast/tax outputs; verify unavailable/null values propagate across summaries/scenarios and document recurrence, anchor, and tax-completeness behavior in module guidance.

## 7. DepositGuard and public action boundaries

- [ ] 7.1 Apply independent start/request/milestone/payment mappings to DepositGuard lists/details/rollups and actions; test safe minimal parent context for eligible children, excluded child payload suppression, undated jobs, and complete-ledger settlement without old activity disclosure.
- [ ] 7.2 Gate PaidSoon deposit/promise token page and API access plus new payment-link/intent creation before payload, visit mutation, or provider redirect; test now-excluded valid tokens, generic unavailable responses, no provider calls, and restoration subject to existing token expiry.
- [ ] 7.3 Preserve signed provider settlement, imports, and reconciliation for excluded records; regression-test signature rejection, full-ledger updates, later cash movements, unchanged ingestion cursors, and no destructive workflow changes from a settings save.
- [ ] 7.4 Document unavailable public-link behavior, recoverability on clear, and inability to revoke already issued external provider URLs; verify customer-facing text does not promise provider recall.

## 8. MarginGuard RunwayGuard and digests

- [ ] 8.1 Apply source policy and revision provenance to MarginGuard calculations/classifications, snapshots, alerts, opportunities, exports, and trends; test truncated comparisons, stale generation-time bypasses, and unavailable margins rather than fake zeroes.
- [ ] 8.2 Propagate eligible CashPlan/CommitGuard inputs and quality through RunwayGuard service/integrations/snapshot jobs; test required current balance and burn coverage, stale snapshot rejection, and no positive runway status on insufficient inputs.
- [ ] 8.3 Pass one policy through Owner’s Digest providers and version snapshot/delivery owners, rebuilding narrative/items/metrics from eligible providers; test unavailable provider propagation, mixed-revision rejection, and immutable already-sent evidence during same-period rebuild.
- [ ] 8.4 Apply equivalent policy to weekly debtor summaries and dashboard digest entries; test filters and final payload provenance, preserved successful-send deduplication, and old deliveries not relabeled current.
- [ ] 8.5 Update margin/runway/digest guidance and UI/export quality states; verify partial period labels, unavailable values, and no reassuring narrative when required inputs are missing.

## 9. Both scheduling runtimes and dispatch consistency

- [ ] 9.1 Update Python invoice/deposit claim SQL in `worker/paidsoon_worker/db.py` to join current setting and exact business dates before claim limits, returning policy context; verify shared JSON vectors in worker tests and real isolated PostgreSQL claims with null/active/missing-date fixtures.
- [ ] 9.2 Propagate context through Python dispatcher/tasks/CommitGuard work and TypeScript internal handlers, including manual/retry/stale recovery paths; test that execution re-resolves current policy and claim-time context cannot authorize stale work.
- [ ] 9.3 Enforce policy in TypeScript cron/reminder/deposit/digest/snapshot/commitment/promise/snooze job paths without changing job authentication; test excluded actions skip without cancelling workflows and policy read failures remain retryable and unsent.
- [ ] 9.4 Add a fresh final policy check outside earlier calculation snapshots before external send or payment handoff; test changed revision rebuild/retry, read-error suppression, and the documented boundary for actions already handed to a provider.
- [ ] 9.5 Make skipped unsent claims reclaimable after revision changes while preserving successful-send idempotency; test set/clear restoration, repeated retries, concurrent claims, no duplicate successful messages, and no replay after moving the date backward.
- [ ] 9.6 Add sanitized operational reasons for conflict, missing date, incomplete coverage, stale output, and dispatch skip/retry; verify tests never log customer PII/tokens/amounts and update worker/deployment guidance for mixed-version writer draining.

## 10. Cross-surface verification and guarded rollout

- [ ] 10.1 Execute one two-tenant fixture through every decision-7 surface for untouched/set/change/clear states; verify list/detail/mutation/export/summary/public-link/job agreement, excluded-history retention, and unchanged billing/ingestion without real provider calls.
- [ ] 10.2 Run repository tests, relevant worker tests, changed-file lint, TypeScript checking, production build, and strict OpenSpec validation; record pre-existing failures separately and verify all new policy/date vectors pass in both runtimes.
- [ ] 10.3 Complete the isolated migration/RLS/audit/race verification and writer/reader provenance matrix; record SQL execution evidence and explicitly leave checks blocked if isolated credentials are unavailable rather than using a shared database.
- [ ] 10.4 Produce a reviewed rollout/rollback checklist confirming additive schema/secured SQL installed, every active TypeScript/Python writer upgraded, old queued work rechecked, and editing disabled until coverage passes; verify rollback retains enforcement/audit for active cutoffs and never silently clears settings.
