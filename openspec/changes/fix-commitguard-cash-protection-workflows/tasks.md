# Tasks

## 1. Additive schema and isolation

- [x] 1.1 Add the D1 cash context, currency-bound buffer fields, D5 candidate/conversion identity, D7 work/revision fields, D8 evaluation/event relevance state, and D9 snapshot/planned-date metadata to Prisma; verify generation and schema validation without modifying existing trial/billing models.
- [x] 1.2 Add D4 typed coverage relations, composite tenant keys, uniqueness, and restrict-delete behavior; generate an additive migration using an isolated database and verify its diff includes only this change's models/columns/indexes.
- [x] 1.3 Define the all-or-none cash/expense groups, exactly-one coverage target, positive/capped amounts, and initial pending-work invariants in a reviewed CommitGuard-only supplemental SQL artifact; verify each CHECK rejects invalid isolated-database fixtures.
- [x] 1.4 Add canonical RLS and column grants for cash, coverage, work, and evaluation state; extend isolated RLS probes to reject cross-tenant source links, owner reassignment, forged job state/fences, and tenant evaluation-state writes.
- [x] 1.5 Build a dry-run legacy conversion reconciliation report using only unique audit evidence; verify fixtures cover unambiguous, missing, duplicate, and conflicting links without deleting or merging commitments.
- [x] 1.6 Document schema/ACL additions and ordered migration review in DDD and the CommitGuard runbook; verify a before/after isolated ACL/schema baseline preserves trial journals, grants, reservations, effective-access tables, and user-profile permissions.

## 2. Owner cash context and portable policy

- [x] 2.1 Implement the pure D1 validation/freshness/currency contract and tenant cash-context loader; verify zero/negative balances, date 7/day 8, future dates, Int overflow, the explicit eight-currency allowlist, missing versus zero, and independent Tax Buffer entitlement.
- [x] 2.2 Add authenticated subscription-guarded cash-context GET/PUT with revision conflicts and changed-field audit; verify 401/403/400/409, clear behavior, safe DTOs, and tenant-scoped mocked transactions.
- [x] 2.3 Bind fixed buffers and weekly-expense bases to their own currencies and dates; verify currency changes never relabel money and legacy positive untagged buffers require review.
- [x] 2.4 Extend settings-transfer validation/DTOs for optional fixed-buffer currency only; verify legacy partial imports remain compatible and exports/imports cannot carry cash balances, financial attestations, conversion links, or job state.
- [x] 2.5 Add usable cash/expense/tax-currency attestation forms and stale/missing actions; verify accessible labels, negative/zero amount submission, revision conflict handling, and explicit source/date wording; update the user guide and API/runbook contracts without claiming provider sync.

## 3. Correct recurrence and protection calculations

- [x] 3.1 Replace historical recurrence traversal with anchor-preserving skip-ahead projection and half-open UTC windows; verify January 31, leap-year annual recurrence, old weekly anchors, today/window-end boundaries, start/end dates, and emitted-row cap errors.
- [x] 3.2 Remove new custom recurrence selection and reject unsupported custom writes while retaining legacy review/edit access; verify the real engine surfaces incomplete custom records rather than treating them as one-off.
- [x] 3.3 Add currency-partitioned confidence totals and selected-horizon commitment protection; verify mixed AUD/USD is never summed, all confidence classes are labeled, and day-45 obligations affect a configured 60-day free-cash calculation.
- [x] 3.4 Implement fixed, 30-day percentage, and dated weeks-based buffer composition with explicit quality reasons; verify four times 20000 cents equals 80000, missing basis does not become zero, and safety thresholds retain documented complete-input behavior.
- [x] 3.5 Extract the D2 read-only Tax Buffer category adapter using existing pure calculations and overrides, without CashPlan reads or snapshot/event/default writes; verify category-required versus reserved/gap amounts, mixed-source currencies, missing configuration, and not-applicable entitlement cases.
- [x] 3.6 Implement tenant-locked coverage CRUD and category-level overlap reconciliation; verify R=12000/C=10000, aggregated C=12000 and C=15000, disjoint bill/tax coverage, over-coverage races, and disabled/stale targets with unit and isolated storage tests.
- [x] 3.7 Publish summary contract v2 with nullable unavailable outputs, primary/multiple quality reasons, grouped horizons, and source dates; update summary/adapter endpoints to reject legacy override queries and perform no durable writes; verify missing cash produces no WATCH assertion or event.
- [x] 3.8 Document recurrence boundaries, conservative confidence inclusion, tax coverage, currency exclusions, selected horizon, and unavailable states in DDD/runbook/user guidance; verify examples match engine regression fixtures.

## 4. Atomic lifecycle and conversion

- [x] 4.1 Add shared per-tenant creation serialization and use it in manual create and conversion; verify the real services enforce the unchanged archivedAt-null allowance with competing database transactions for the last slot.
- [x] 4.2 Implement unique conversion links, locked candidate transition, retry return of original commitment, and atomic audit; verify sequential/concurrent confirmation creates one commitment and one conversion event and legacy ambiguous conversions return review-required.
- [x] 4.3 Implement the D5 transition matrix, no-op retry behavior, and changed-field audit for dates/recurrence/renewal/confidence/essentiality; verify cancelled/expired resume conflicts and duplicate requests do not multiply audit events.
- [x] 4.4 Add revision increments and durable evaluation requests to each successful material mutation in the same transaction; verify rollback leaves neither partial mutation nor orphan work, and document lifecycle/conflict semantics in the module runbook.

## 5. Explainable detection and durable ingestion handoff

- [x] 5.1 Enforce current module enablement, detection opt-in, and execution entitlement inside detection; verify disabled/missing-access runs stop before evidence computation and support configured minimum occurrences 2..10.
- [x] 5.2 Build connection/currency-scoped outgoing-only evidence with stable source IDs and separate bill/bank streams; verify incoming rows, void bills, duplicate references, and two connections do not inflate a recurrence signal.
- [x] 5.3 Add stable candidate upsert identities, preserved user corrections, rejection/ignore evidence baselines, and observed-schedule due-date suggestions; verify two-sample/amount reactivation thresholds, delayed confirmation, and no reopening of converted candidates.
- [x] 5.4 Persist deduplicated detection work at successful accounting-spend run and spreadsheet batch completion; verify replay, partial/failed sync suppression, crash-after-commit recovery, and independence of import success from detector failure.
- [x] 5.5 Expose on-demand detection and complete candidate-edit controls; verify pending counts/results, field validation, confirmed-threshold legacy review, and correct edit/confirm/ignore/reject conflict handling; document trigger and suppression behavior in user/runbook guidance.

## 6. Recoverable evaluation and operational alerts

- [x] 6.1 Implement the D7 tenant/work lock order, atomic side-effect fence/revision checks, and narrow trusted role-boundary helper; verify expired workers cannot persist events/candidates/state, role restoration rolls back safely, and queued permissions are not trusted.
- [x] 6.2 Add the authenticated internal CommitGuard job handler with current effective-access checks and safe job DTOs; verify invalid secret, mismatched tenant/item, revoked/expired access, and unsupported job-kind requests perform no financial work.
- [x] 6.3 Extend Railway dispatch with bounded five-minute work scans and one daily enabled-tenant evaluation, pending-enqueue recovery, lease renewal/recovery, six-attempt exhaustion, and authorized retry generations; verify mocked worker tests cover lost enqueue and out-of-order revisions.
- [x] 6.4 Add repair scanning for successful completed accounting runs/import batches lacking canonical work; verify idempotent recovery does not recreate exhausted generations or process failed/partial runs automatically.
- [x] 6.5 Evaluate due events from projected active occurrences and stable renewal-cycle thresholds; verify paused/expired/cancelled exclusions, future recurrences with old nextDueDate, exact UTC due windows, missed deadlines, and no daily renewal-countdown duplicates.
- [x] 6.6 Implement quality-aware risk episodes and material amount-change event revisions; verify missing/stale inputs create no cash-risk alert, unchanged risk deduplicates, SAFE resolves, recurrence creates one new episode, and preference/entitlement changes suppress future alerts.
- [x] 6.7 Add tenant-scoped paginated alert-history DTOs and workspace presentation with active/history relevance and deep links; verify unauthorized access, safe formatting, reachable pages, and event navigation.
- [x] 6.8 Update operations documentation with job authentication, one scheduler owner, backlog/failure inspection, repair/retry procedures, and no guaranteed immediate email; verify documented diagnostics omit sensitive amounts, suppliers, and recipients.

## 7. Consistent consumers and usable dashboard

- [x] 7.1 Update CommitGuard page, overview, and Owner's Digest cash metrics to shared saved cash context and version-2 quality/currency formatting; verify they agree for the same input revision and do not require Tax Buffer to read owner cash.
- [x] 7.2 Add a coherent workspace DTO/refetch plus server refresh after all successful mutations; verify hero/horizons/upcoming/renewals/review-count refresh together and save-success/refresh-failure has a retry that does not repeat the mutation.
- [x] 7.3 Add validated search/sort/category/status/essentiality/frequency/source/due/currency URL filters and accessible pagination; verify filter-before-page behavior, integer clamping, preserved parameters, empty states, and access to more than twelve matches.
- [x] 7.4 Replace SpendLeak summary-text search links with explicit insight identity filtering and retain CostGuard relationship filtering; verify source/destination integration tests find renamed linked commitments without unrelated matches.
- [x] 7.5 Add full commitment classification/renewal/notice/auto-renew editing, annualized source-currency renewal context, and renewal pagination; verify more than eight renewals remain reachable and edits change severity/audit.
- [x] 7.6 Make settings enablement/default horizon/weekly basis and draft warning-window controls effective; verify disable retains records but suppresses automated protection/detection/contribution, and typing a comma or clearing draft text is not normalized prematurely.
- [x] 7.7 Translate relevant CommitGuard events into the existing Owner's Digest provider using stable event/entity identities, source dates, category preferences, and cash-pressure correlation; verify enabled/disabled email entitlement paths and no duplicate event/live-risk signal in one digest, without adding a sender or mail subscription.
- [x] 7.8 Update user/module architecture and runbook documentation for real controls, quality states, notification history, and existing digest-only delivery; verify no documentation asserts a generic framework, automatic bank balances, or standalone immediate mail.

## 8. Bounded CashPlan consumption

- [x] 8.1 Implement D9 plan/settings selection, timezone-aware 13-week anchor, owner gross starting cash, and preliminary balance-age quality; verify requested/foreign plan IDs, currency mismatch, date-7/day-8, DST boundaries, and unavailable amounts without fabricated zero cash.
- [x] 8.2 Assemble only the documented occurrence/bill/version-2 fact sources and preserve source/currency/coverage lineage; verify paid, absent, excluded, incompatible, or out-of-window bills never erase commitment residuals and partial 6000/10000 coverage leaves 4000 only when the bill is actually included.
- [x] 8.3 Persist explicit plannedDate for new manual planned items and apply latest valid targeted overrides; verify legacy rows without timing remain visible as timing_review rather than silently dropped or scheduled by guessed IDs.
- [x] 8.4 Add version-2 canonical snapshot input metadata and explicit POST/job refresh; route summary/items/settings/overview/digest through the same assembler and verify create/pause changes all consumers without GET snapshot writes or merging opaque historical weeks.
- [x] 8.5 Add integration fixtures for commitment-only preliminary forecasts, validated source-fact reuse, gross-cash-not-free-cash opening balance, tax protection not subtracted as a movement, and disabled module behavior; update CashPlan/CommitGuard runbooks to state the exact included source boundary and retained historical snapshots.

## 9. Cross-cutting acceptance and rollout evidence

- [ ] 9.1 Run the full Node suite, affected lint, TypeScript diagnostics, Prisma validation, and production build; capture commands/results and separate pre-existing failures from changes, with no external DB/API/email use in unit tests.
- [x] 9.2 Execute isolated PostgreSQL migration/CHECK/RLS/concurrent-transaction tests for all new models and same-tenant relations; verify unrelated trial/billing schema and ACL baselines remain unchanged and record any blocked checks instead of marking them complete.
- [x] 9.3 Perform authenticated synthetic-tenant browser acceptance for cash entry, stale/mixed currency, recurrence, duplicate confirmation, allowance race, candidate edits, filters/pagination, renewal edits, complete mutation refresh, and accessible mobile width; record evidence without real customer data.
- [ ] 9.4 Verify scheduled evaluation without page visits, ingestion completion-to-detection, lost-enqueue recovery, disabled/revoked access, and relevant Owner's Digest inclusion using mocked delivery or an approved non-delivering test transport; record deployment-dependent checks separately.
- [x] 9.5 Produce a reviewed rollout checklist with the actual target migration order, CommitGuard-only supplemental SQL/policies, one Railway workflow owner, repair/backlog monitoring, and rollback without destructive data changes; leave shared-database application and scheduler activation pending separate authorization.