# Design

## Context

See [proposal.md](proposal.md) for the audit motivation and scope. The existing module has a pure recurrence/free-cash engine, tenant-scoped services, API handlers, a server-rendered page, and a client mutation workspace. Existing tests pass but mostly isolate the page/routes from service behavior.

Important verified constraints:

- The dedicated page supplies null cash. Overview and the digest instead obtain cash from Tax Buffer, whose currency-less cash snapshot has no production ingestion writer. There is no reusable FX service.
- Detection has one POST caller, no ingestion handoff, no effective opt-in guard, and no unique conversion relationship. Incoming bank movements currently become absolute-value evidence.
- `CommitmentEvent` stores history but is not consumed by a notification dispatcher. `buildCommitGuardNotificationPlan` is an unused classifier, not a shared notification framework.
- Owner's Digest has a real provider contract, persisted snapshots, settings/cadence, and an email delivery path. Its existing delivery limitations are not solved by adding another sender.
- CashPlan's pure engine accepts 13 weeks of facts. Its production summary loads opaque snapshots or builds an empty forecast; no existing assembler can safely accept a total and deduplicate it against a bill.
- Tax Buffer currently mixes protection calculations with cash-plan reads and snapshot/event writes. Calling that whole orchestration from a CashPlan assembler would risk a dependency cycle.
- The approved cash-source choice is owner entry with currency and date, no FX, and deferred provider-balance ingestion. The seven-day freshness limit and other numerical rules below are explicit proposed acceptance defaults for review, not claims about existing behavior.

## Goals / Non-Goals

**Goals:**

- Produce one explainable summary for CommitGuard, overview, and the digest with explicit input quality.
- Close real product paths, including ingestion, durable evaluation, conversion, refreshed UI, and CashPlan consumption.
- Keep additive migrations, current plan definitions, subscription execution guards, and RLS as hard boundaries.

**Non-Goals:**

- No provider-balance acquisition, FX, automatic debtor-payment reconciliation, custom RRULE interpreter, or guessed source matching.
- No new mail channel, generic notification platform, or unrelated changes to Owner's Digest transport.
- No wholesale CashPlan or Tax Buffer rewrite; isolate the needed fact/protection adapters and clearly label partial forecasts.

## Decisions

### D1. Persist an explicit owner-attested cash context

Add `CommitGuardCashContext`, unique on `userId`, with nullable `amountCents`, `currency`, `balanceAsOf` (UTC date), optional `weeklyOperatingExpensesCents`, `weeklyExpensesCurrency`, `weeklyExpensesAsOf`, and optional `taxProtectionCurrency`; include `revision`, `createdAt`, and `updatedAt`. Add `safetyBufferCurrency` to settings for fixed buffers. Weekly expenses and tax currency are owner-entered attestations with clear labels, not inferred bank facts. Clearing the balance clears its three fields together; operating-expense configuration retains its independent currency. Require all-or-none balance and expense field groups and an integer amount within Prisma Int bounds; accept negative gross cash. For this cents-based v1, use one explicit shared allowlist: AUD, USD, NZD, GBP, EUR, CAD, SGD, and HKD (lowercase storage). Other stored commitment currencies remain visible but unsupported for free cash. Reject unsupported cash codes and future dates.

Never relabel saved fixed buffers or expenses when cash currency changes. Their mismatches make protection incomplete until the owner explicitly re-enters/re-attests them. A legacy positive fixed buffer has unknown currency until attested; an explicit zero buffer is currency-neutral. Settings-transfer JSON carries `safetyBufferCurrency` with the fixed policy but never cash inputs, expense bases, or tax attestations. Legacy imports with positive fixed amounts require currency confirmation. This is a format-compatible optional policy field, not a backup of financial inputs.

Provide authenticated `GET/PUT /api/commitguard/cash-context` using Zod, the subscription wrapper, core entitlement, and `withUserContext`. PUT uses the expected revision, returns 409 on stale edits, and records changed-field audit metadata without logging values. Responses expose a safe DTO without tenant identity. Never put cash balances, dates, expense bases, or attestations into settings-transfer JSON; settings exports retain their existing policy-only contract.

Normalize evaluation to UTC calendar dates. A balance is fresh when date difference is 0..7 inclusive; on day 8 it is stale. The same freshness rule applies to an owner-entered weekly-expense basis. Stale values remain visible but are not used for actionable free cash. Missing is not zero; an explicitly saved zero is valid.

Alternative: reuse `CashForecastSnapshot` or a RunwayGuard result. Rejected: currency/provenance are absent, snapshots are seed-only inputs, and usable cash is not gross cash. Provider ingestion is deferred by the user's decision.

### D2. Compose shared read-only facts, not mutually derived summaries

Extract tenant-scoped read-only loaders from CommitGuard and the relevant Tax Buffer input path. A `loadCommitGuardCashContext(userId, now)` loader is independent of Tax Buffer entitlement. A `loadCommitGuardProtectionFacts` adapter returns enabled tax reserve category IDs, amounts, attested currencies, source dates, and quality reasons without reading CashPlan or writing Tax Buffer defaults/events/snapshots. Reuse the existing pure Tax Buffer category calculation and latest category overrides rather than calling `loadTaxBufferSummary` from the new composition path. Category identity is the existing `TaxReserveCategory.id`; this change does not generate obligation rows or invent tax periods. `requiredReserveCents` is the full required amount, not the reserved balance or gap, because gross owner-entered cash includes reserved cash. Category disabled/deleted means its coverage must be reviewed; it cannot silently erase a commitment.

When Tax Buffer is not entitled or explicitly disabled, its protection component is zero with reason `not_applicable`. When entitled but not configured or currency-ambiguous, it is incomplete, not zero. The owner can attest the tax-protection currency in the cash-input UI; the adapter also inspects source currencies and rejects a contradictory/mixed source set. Do not infer historical reserve currency from the cash balance. Existing Tax Buffer summaries outside this adapter are not rebuilt in this change.

The summary contract becomes version 2:

- `asOf`, `inputRevision`, `enabled`, `selectedHorizonDays`, and `cashContext` with amount/currency/balance date/freshness/source.
- `horizonsByCurrency`, each containing 7/30/60/90-day total, confirmed, probable, and potential amounts.
- `protection` components and overlap adjustments with source IDs and currency.
- `quality`: `complete | missing | stale | unsupported_currency | incomplete | disabled`, plus a list of machine-readable reasons and actions. Multiple reasons can coexist; precedence for the primary state follows that order with disabled first.
- `freeCash`: existing monetary field names where meaningful, nullable aggregate amounts when incompatible/incomplete, `status: safe | watch | at_risk | shortfall | null`, and currency. Only complete compatible inputs have a safety status.

Preserve a legacy aggregate `horizons` projection only for single-currency complete totals; otherwise set the legacy aggregate to null and require grouped consumers. Upgrade every internal consumer in this change, including the overview and digest formatter. The existing summary/CashPlan GET endpoints remain but become read-only: reject legacy cash/tax/expense override query keys with 400 and a stable migration message. Durable risk decisions never use client query numbers. Use the cash-context endpoint to change saved inputs.

Alternative: label missing cash as WATCH. Rejected because lack of evidence is not low-buffer evidence and currently generates false risk alerts.

### D3. Keep protection conservative and recurrence calendar-correct

Project active/upcoming/ending/review commitments, excluding archived, paused, cancelled, and expired records. Include confirmed, high/medium (probable), and low (potential) amounts in conservative protection, with all partitions visible. Apply selected horizon to free-cash commitment protection; keep the next-30-days hero and monthly-percentage buffer basis explicitly at 30 days.

Use a half-open UTC horizon `[today, today + days)` so a seven-day horizon contains exactly seven dates; include occurrences on start/end dates only when also inside that window. Validate `startDate <= endDate` and `nextDueDate` against declared boundaries on new edits. Skip to the first eligible occurrence mathematically, retaining the original anchor day for monthly/quarterly/six-monthly/annual sequences. January 31 advances to February's last day then March 31; annual February 29 returns on leap years. Do not spend a 250-row budget traversing historical dates. Bound emitted rows by the requested horizon; a computation cap must produce an incomplete reason, never a silent total.

Custom recurrence has no implemented interpreter. Remove it as a selectable new recurrence and reject new/custom edits with a field-level 400. Preserve legacy custom records for editing to a supported frequency, label them unsupported, and suppress complete consolidated free cash when relevant. This avoids silently treating custom as one-off while not adding an unapproved recurrence language.

Buffer formulas remain: fixed amount; percent of compatible 30-day commitments; or saved weeks times an explicit fresh same-currency weekly-expense basis. Missing weeks/basis is incomplete; zero explicitly entered is supported.

Keep existing complete-input safety thresholds: negative free cash => shortfall; nonnegative through 25% of safety buffer => at risk; through 100% => watch; otherwise safe. Zero free cash with zero buffer is at risk. Calculate in integer cents and reject/surface overflow rather than wrapping a database Int.

### D4. Use explicit coverage to avoid double counting

Add `CommitmentCoverage` with tenant, commitment, occurrence UTC date, currency, positive covered cents, and exactly one optional imported-bill or tax-reserve-category reference. A composite foreign-key strategy must enforce same-tenant links; add composite unique `(userId, id)` targets on Commitment, ImportedBill, and TaxReserveCategory. Use RESTRICT for referenced financial-row deletion, explicit coverage removal in a tenant transaction, and no cascading owner reassignment. Unique `(userId, commitmentId, occurrenceDate, targetKind, targetId)` prevents duplicate coverage; store the discriminated target in typed columns and enforce exactly one with a reviewed CHECK. Coverage can be edited only after validating target ownership/currency and total coverage caps under the same tenant lock. Never merge by supplier/amount/date similarity.

For each enabled tax category, aggregate matching selected-horizon commitment coverage C before comparing to that category's required reserve R: protect `max(R, C)` for the overlapping portion, then add uncovered commitments and unrelated reserves. For example R=12000 and two linked occurrences of 6000 each protect 12000 once; if C=15000 protect 15000, not 27000. Total coverage across all targets for one occurrence cannot exceed its amount; links to the same bill cannot exceed its unpaid amount. Bill and tax links use disjoint portions of an occurrence; a bill-covered tax portion requires the bill's same-category attribution and is reconciled once in the protection ledger. If that attribution is absent, mark overlap incomplete rather than guessing. Disabled/deleted/settled targets make links stale and require review, not a zero residual. Unlinked commitments in the explicit `tax` category require review when tax protection is active. Other categories remain distinct; explain that owners must classify tax commitments correctly. Currency-unknown or contradictory coverage blocks consolidated free cash. Add reviewed bill/tax coverage controls in the commitment editor; partial bill coverage subtracts only the covered amount from the generated CashPlan occurrence when that same bill amount is actually present in the forecast's canonical facts, not merely because a link exists.

Alternative: subtract all tax-category commitments or guess bill matches. Rejected because either can under-protect cash or remove legitimate independent outflows.

### D5. Serialize creation and preserve one conversion

Add nullable `sourceDetectionCandidateId` to `Commitment` with a tenant-safe unique relationship, and a stable nullable `candidateKey` on legacy candidates. New candidates require `candidateKey`, unique per tenant, derived from connection + normalized supplier identity + currency + supported frequency. Do not group separate accounting connections.

Both manual create and candidate conversion acquire the same per-tenant transaction advisory lock before counting existing `archivedAt: null` records. Preserve that existing allowance-count policy, including cancelled-but-not-archived rows; do not introduce archive behavior here. Recheck current entitlement and limit inside the serialized operation. Lock/select the candidate, return its existing conversion before the allowance check on retries, create/link/convert/audit atomically, and rely on the unique constraint as defense in depth. No UI button-disable or check-before-write substitute.

Pending -> converted/ignored/not_a_commitment are explicit review transitions. Editing pending/ignored/rejected records returns them to pending only through a deliberate user edit; converted records cannot reopen. Repeated ignore/reject is a no-op without another audit event.

The owner explicitly approved the following commitment matrix on 2026-10-19. Check archived state and source-status eligibility BEFORE no-op confidence checks:

| Action | Allowed source status | Result | No-op retry | Conflict (409) |
| --- | --- | --- | --- | --- |
| Pause | active, upcoming, ending, review | paused; set pausedAt | paused | cancelled, expired |
| Resume | paused | active; clear pausedAt | none | every other status |
| Cancel | active, upcoming, ending, review, paused | cancelled; set cancelledAt | cancelled | expired |
| Confirm | active, upcoming, ending, review | confidence confirmed; preserve status and lifecycle timestamps | already confirmed in an allowed source status | paused, cancelled, expired |

Archived commitments are read-only for every mutation, including otherwise no-op actions. No archive action is introduced. Cancelled and expired commitments remain editable for descriptive, schedule, renewal, and classification fields, but PATCH cannot write lifecycle status (including the same status). Preserve legacy custom recurrence on unrelated edits; owners may repair it to supported recurrence. Resume cannot restore cancelled/expired records.

Updates and lifecycle actions share lock order: tenant transaction advisory lock, tenant-owned commitment row `FOR UPDATE`, then re-read and validate the current row. Refresh core access after waiting. Missing and foreign IDs both return 404. Material mutations and their audit commit atomically; conflicts and no-ops perform no update, timestamp change, or audit insert. Successful no-ops return the current commitment with null audit. Audit metadata contains only changed fields with before/after values, including dates, recurrence, renewal/notice/auto-renew, confidence, essentiality and lifecycle timestamps. Dates use ISO strings; unchanged fields are omitted. Task 4.3 does not add revision increments or evaluation work; those remain task 4.4.

Legacy conversion backfill uses only unambiguous tenant-matching `COMMITMENT_CREATED_FROM_DETECTION` event metadata (`sourceCandidateId`) and one resulting commitment. If absent, duplicated, or conflicting, preserve records and expose `conversion_review_required`; do not allow new conversion. Report historical duplicates for human review without deleting financial history.

Alternative: an in-process mutex or candidate status check alone. Rejected because multiple API/job instances can race.

### D6. Detect only from scoped, outgoing, explainable evidence

Extend detection snapshots with connection identity, signed direction/status, source type/ID/date/amount/currency, and explicit economic references. Use outgoing bank rows only; exclude void/cancelled bills. Analyze bills and bank streams separately, never concatenate them to satisfy occurrence thresholds. Prefer a qualifying bill stream over a qualifying bank stream for the same connection/supplier/currency/frequency; keep alternate evidence informational. Exact source IDs and explicit provider references remove known duplicates. Ambiguous potential duplicate streams do not inflate sample count.

Honor configured minimum occurrences 2..10 (default 3), variance 1..100 percent, interval tolerance 1..30 days, and generated confidence low/medium/high. Keep legacy threshold `confirmed` readable but flag it as requiring review because a detector cannot infer human confirmation; the form offers low/medium/high only. Material rejection/ignore reactivation requires two new distinct samples or an amount delta at least `max(500 cents, 15% previous typical amount)`. Preserve rejection evidence rather than overwriting its baseline every run.

Persist observation IDs/dates in evidence, latest observed date, recurrence anchor, and editable suggested due date. The due-date suggestion is the first recurrence on/after today using the evidence anchor, not today plus a period. Candidate edits survive unchanged-evidence reanalysis; changed evidence is shown for review rather than silently overwriting corrections.

Add an entitled on-demand Detect action (POST existing detections endpoint) returning disabled/conflict/error states explicitly. A completed successful accounting spend sync and completed spend-import transaction create unique durable work keyed by run/batch identity. Partial/failed syncs do not schedule automatic detection; manual detection can inspect persisted evidence with an explicit partial-source warning. Detection failures never roll back a successful import.

### D7. Durable work plus repair, not browser-driven alerts

Add `CommitGuardWorkItem` with `userId`, kind (`detect | evaluate`), immutable dedupe key/source identity/revision, state (`pending | processing | completed | skipped | failed`), attempts, requested/completed dates, lease owner/expiry, fence, and safe error code. Unique `(userId, kind, dedupeKey)` and indexed state/next-attempt fields support bounded scans. Add `calculationRevision` to settings; mutations increment it and enqueue evaluation in the same tenant transaction. Include work for changed cash/settings and supported lifecycle changes. Accounting completion persists detection work with the completed run when possible; a repair sweep scans successful completed runs/batches lacking their unique work row to close the post-commit/crash gap.

Extend the existing Railway workflow with a five-minute bounded dispatch that also creates one daily evaluation item per enabled eligible tenant/UTC date. Use the existing internal-job secret/authentication and central `getFinancialJobAccessSkip` at execution time; the task payload is an identity, not cached permission. A new authenticated internal handler `POST /api/internal/jobs/commitguard` claims a persisted item by ID and tenant match, executes with `withUserContext`, and finalizes only with the matching fence. The system claim/read path can use a documented `prismaAdmin` exception; financial reads/mutations stay tenant-scoped.

Use a 60-second renewable lease, bounded batches, and exponential retry capped at six attempts. Lock order is tenant advisory lock -> work row -> candidate/event/coverage rows. Before EVERY side-effect transaction commits, validate current effective access, expected calculation revision, unexpired lease owner, and fence; a conditional work-row fence assertion is part of the same transaction and failure rolls back all candidate/event writes. An expired or superseded worker cannot publish findings before failing finalization. Outdated evaluation revisions become skipped/superseded, leaving newer pending work intact; independent ingestion-source jobs still process their distinct evidence under current settings. Pending rows remain discoverable if Redis enqueue fails; expired processing rows are recoverable. Exhausted work is failed with a safe reason and visible retry action; a trusted retry resets attempts with a new generation while retaining history. Daily repair closes source-completion gaps but does not endlessly recreate an exhausted identical work generation. Record last successful daily evaluation, pending age, attempts, safe failure codes, and counts. Do not log cash values, suppliers, recipients, or source payloads.

Alternative: invoke detection once after commit and alerts during GET. Rejected because crashes lose work and owners receive no alerts without page/API traffic.

### D8. Operational alerts reuse history and the existing digest only

Do not build a generic framework or a second mail sender. Keep domain audit events in `CommitmentEvent`; add event metadata sufficient for a stable cycle/occurrence key, input revision, active/resolved/superseded relevance, and resolved date. Add a per-tenant `CommitGuardEvaluationState` for last evaluation and cash-risk episode/revision; only jobs can mutate this state.

Evaluation uses one injected UTC clock and projected occurrences, not stale `nextDueDate` alone. Due soon is today through day 7 inclusive for active eligible occurrences. An overdue date is not a future due alert. Renewal warning keys are `(commitment, renewalDate, noticeCloseDate, crossed configured threshold)`; sorted positive unique thresholds define the bands: smallest urgent, second action-required, any remaining warning range watch, outside largest info. With one threshold, only urgent/info apply; with two, urgent/action-required/info. Record only the most urgent band reached on first observation and subsequent more urgent threshold crossings. A missed notice deadline is one distinct event. A changed renewal date supersedes old cycle relevance. Never create one key per remaining-day count.

Cash risk requires complete compatible saved inputs. Create one episode at entry into watch/at-risk/shortfall, update the event on amount changes, and create a new severity event only when severity changes. Mark the episode resolved at SAFE; missing/stale data suspends actionable risk without pretending recovery. Amount changes use the existing material threshold (5000 cents or 15%) and input revision identity; decreases are informational context, not automatically negative risk.

All advanced alerts respect current `commitguard_advanced_alerts`, module enablement, and category controls. Basic lifecycle audit events remain regardless of alert entitlement. Paginated alert history is visible in the workspace and distinguishes active/history/unavailable evaluation. No acknowledgment system is added.

Update `loadCommitGuardProvider` to use canonical saved cash context and relevant events. Map critical/warning/watch/info into the existing digest severity vocabulary (watch -> warning with metadata). Preserve event/entity identities and actual source dates, recheck current preferences/access, and correlate cash pressure rather than duplicating a live free-cash signal and its equivalent event. Upcoming due/renewal signals are included only while still actionable; amount/detection informational changes use the reporting period. Existing digest materiality, ranking, cadence, recipient, and delivery settings remain authoritative. No email is sent outside that path. Remove/deprecate the unused immediate/daily/weekly planner so it cannot imply nonexistent channels.

### D9. Consume known outflows in a bounded CashPlan assembler

Add a read-only CashPlan fact assembler called by its summary, items/workspace, settings, overview, and digest consumers. Select a requested tenant-owned plan or the latest existing plan (stable createdAt/id ordering); do not create a plan in GET. Prefer settings for that plan, then tenant-global settings, then the plan's currency/timezone/buffer. Retain the engine's 13-week horizon and make other stored horizons explicitly unsupported rather than silently dropping weeks. CashPlan week 0 begins at midnight of the evaluation date in the selected plan timezone; convert each obligation's UTC calendar date to that local calendar date for week indexing, with tests across DST. Use fresh attested gross cash as an explicitly dated starting-balance estimate at evaluation; do not claim reconciled intervening bank movements. If its date precedes evaluation, add preliminary `unreconciled_balance_age` with both dates even while it remains within the seven-day usable window.

This bounded assembler loads only: (a) active compatible CommitGuard occurrences; (b) explicitly covered unpaid imported bills, with remaining unpaid amount and an in-window due date; (c) version-2 persisted canonical facts whose currency/anchor/source lineage can be validated; and (d) existing overrides targeting those facts. It does not add broad invoice/payment/provider ingestion. Bill remaining amount is derived only from an existing explicit source balance/paid-state field; when unavailable, coverage is unsupported and no bill deduction occurs. Occurrence IDs are `commitguard:<commitmentId>:<YYYY-MM-DD>` with source revision/currency and explicit coverage references. Apply current overrides to their existing target's amount when in their effective interval, using latest updatedAt/id precedence. Existing manual rows lack a persisted weekIndex (the POST response's weekIndex is not stored); preserve those rows and expose `timing_review` until the owner supplies a new explicit planned UTC due date. Add optional `plannedDate` to new manual overrides and the item form; never infer timing from an opaque sourceId or creation time. Standalone planned items need this explicit date; non-manual untargeted overrides remain unsupported. No unsupported override silently becomes another inflow/outflow.

Merge reconstructable canonical source facts with uncovered commitment residuals, then call `buildCashPlanCanonicalFactBundle` and `buildCashPlanForecast`. Coverage is applied only to amounts actually included in the same forecast window and currency; paid, missing, excluded, incompatible, or out-of-window bills do not reduce the commitment residual and instead raise coverage-review quality. Never use free cash as opening cash, never subtract reserve protection as an additional movement, and never add commitment aggregates onto opaque week totals. If only commitments are available, label the projection preliminary/commitments-only with missing receivables/payables/source coverage. Incompatible or missing opening cash yields unavailable summary amounts; do not expose an internal zero-based forecast as actual cash.

Version new snapshot payloads with anchor date, currency, cash-input revision, commitment/settings revision, canonical facts/coverage, quality, and input hash. New snapshots are calculated only by an explicit POST refresh or trusted evaluation job; GETs compute/read without financial writes. Legacy snapshots remain history; without reconstructable inputs they do not remain the active forecast after a relevant change. Reuse a single assembler instead of HTTP-calling CommitGuard's adapter from another server route. The adapter remains an external compatible DTO over the same occurrence contract. Update all callers in one rollout; do not change unrelated scenario/ingestion features.

Alternative: connect only the existing aggregate endpoint or append to persisted week totals. Rejected because neither proves actual consumption or prevents double subtraction.

#### D9 ACL dependency — approved local source and isolated verification, 2026-10-20

Task 9.2 reproduced missing authenticated override SELECT and snapshot INSERT privileges. The bounded assembler requires an explicit CashPlan-only ACL artifact, mirrored verbatim in canonical RLS: tenant SELECT on plans, plan-owned override SELECT/INSERT, and plan-owned snapshot SELECT plus column-allowlisted INSERT for the version-2 base forecast writer. Snapshot scenario references remain null on this narrow insertion path. Overrides and snapshots have **no user_id**; authorization follows their actual `plan_id` to `cash_plans.user_id`, never `owner`, `created_by`, or a supplied tenant identity. No plan creation/update or snapshot update/delete permission is added. Override insertion retains only the columns used by the existing manual-item writer; reassignment is denied.

Replace only policies on these three target tables that apply to the affected operations/client roles, including permissive ALL policies that could OR around ownership; preserve unrelated-operation policies and fail closed for unreviewed overlapping policies rather than deleting unknown deployment policy state. Revoke target-table and target-column client privileges before the explicit allowlists, without changing schema/default privileges, roles, profile/trial/billing permissions or other CashPlan tables. Apply the actual artifact twice in the isolated clone, compare effective policy/ACL equivalence (not policy OIDs), and execute raw authenticated/anon probes without application ownership filters or diagnostic grants. Prove foreign-plan INSERT/SELECT denial, owner/plan reassignment denial, append-only snapshots, successful real refresh and fenced publication, and final-fence rollback. Source-clone cleanup and unrelated schema/ACL baselines must match.

Authorization is limited to local source SQL and isolated tests on the approved socket/template. Shared-database application, deployment, scheduler activation, broader trial/billing changes and task-checkbox completion remain unauthorized. The targeted artifact must be separately reviewed in the eventual rollout order; passing local tests is not deployed RLS evidence.

### D10. Refresh complete UI state and expose the promised controls

Use a shared safe workspace DTO for cash/summary/commitments/candidates/renewals/alerts. The server page loads it; mutations trigger a coherent refetch plus router refresh so server and client views reflect one committed revision. The client must not retain initial props indefinitely. Separate save success from refresh failure, offer refresh retry, and never repeat a successful mutation automatically.

Add full filter/sort controls backed by validated URL parameters, page reset on filter changes, clamped integer pagination, and accessible previous/next links. Filter before paging. Add explicit `spendInsightId` and existing `costGuardAlertId` filtering; remove summary-text relationship navigation. Separate active upcoming rows from historical status filters. Keep all four hero cards; display candidate count separately, and show potential confidence totals and currency groups. Cash entry, weeks/basis controls, tax-currency/coverage review, candidate edits, renewal/date/notice/auto-renew and classification editing all have usable labeled forms.

Renewals include annualized amount in source currency (weekly x52, fortnightly x26, monthly x12, quarterly x4, six-monthly x2, annual x1; one-off/custom unavailable), notice duration, days remaining/missed, and reachable pagination. Warning-window text is local draft state, parsed only at save; empty/invalid lists are field errors rather than silently restored values.

### D11. Keep tenancy and compatibility enforceable in storage

All new tenant-facing tables enable RLS with ownership SELECT/INSERT/UPDATE policies only where needed. Cash contexts and coverage are tenant writable; foreign keys enforce tenant equality. Work items permit tenant SELECT and INSERT of pending requests only; column-level INSERT grants and CHECKs fix state=pending, attempts=0, fence=0, and null lease/completion fields. A forged dedupe key cannot suppress work: workers validate the referenced source/revision and repair uses the independently derived canonical source identity. No authenticated UPDATE/DELETE of lease/fence/state is allowed. Worker updates and evaluation-state writes use the documented system executor transaction, never fabricated user access; each tenant financial side-effect transaction uses `withUserContext` plus system-side fence validation in the same atomic database boundary. Provide a narrowly scoped internal DB helper if both roles are needed: system executor establishes the fence/lock, sets tenant context/role for financial operations, restores the privileged executor only for work/state finalization, and never exposes it to routes. Test role restoration and rollback together. Evaluation state is tenant-readable but system-write-only. Do not grant a tenant a way to rewrite another tenant ID or a dispatch fence. User responses omit raw DB rows/tenant IDs and internal lease metadata. All externally supplied IDs, query params, source kinds, and bodies use Zod.

Preserve existing route paths and plan limits; update consumers atomically for nullable/versioned outputs. Unavailable is a financial data state, not an unexpected 500. Use 401 unauthenticated, 403 denied/allowance, 404 missing tenant-owned resource, 409 stale revision/invalid transition, and 400 invalid input/unsupported recurrence/query overrides. Error bodies never expose provider payloads or database internals.

## Risks / Trade-offs

- [Risk] Manual cash goes stale -> show balance age, explicit seven-day cutoff, refresh action, and suppress unsupported risk assertions.
- [Risk] Scope touches partially implemented adjacent modules -> limit CashPlan to the documented assembler contract, test existing overrides, and keep partial coverage visible rather than claiming a complete forecast.
- [Risk] No general FX/tax-currency metadata -> use explicit attestations plus source validation; incompatible totals remain unavailable.
- [Risk] Historical conversion/evidence ambiguity -> conservative backfill, review-required states, no automatic financial deletion or supplier-name matching.
- [Risk] Job retries/races -> durable pending work, daily repair, tenant serialization, storage uniqueness, renewable leases/fences, and tests with competing workers.
- [Risk] Existing digest transport cannot be treated as exactly-once -> reuse its current audited channel, add no competing sender, and do not claim transport improvements delivered by this change.
- [Risk] Preview/production scheduler rollout differs -> document one selected Railway workflow owner per environment, verify internal-job auth, and do not enable a parallel Vercel writer by default.

## Migration Plan

1. Generate additive Prisma migrations on an isolated disposable PostgreSQL database. Do not use `migrate dev --create-only` against shared development: it can apply earlier pending migrations. Review SQL/indexes/check constraints and RLS separately before any shared-database operation.
2. Add nullable cash and conversion/source fields, new context/coverage/work/state models, required indexes and tenant FKs, and versioned CashPlan snapshot metadata. Do not backfill cash/currency as AUD. Backfill conversion links only from unambiguous audit evidence, with a dry-run ambiguity/duplicate report.
3. Verify schema migration and RLS on the isolated target, including foreign-key cross-tenant attempts and authenticated attempts to mutate job lease/state. Capture the complete current-schema baseline first, including trial grants/operations/notifications, billing risks, customer reservations, and journal relations. Preserve their schema and effective-access behavior. Review pending migration order against the actual deployment target before proposing deploy; do not run a blanket migration deploy while unrelated pending trial changes remain unapproved. Apply only reviewed CommitGuard policy statements, not the full canonical SQL or unrelated pending trial/billing constraint scripts. Store new CHECKs that Prisma cannot express in a dedicated reviewed CommitGuard supplemental SQL artifact with exact application order; do not edit historical migrations or activate trial restrictions as a side effect. Compare before/after role/table/column ACLs for user_profiles and trial tables on the isolated target.
4. Deploy compatible contract readers and new services/forms together. Keep automated work dispatch disabled until data migration, job authentication, and pending-work repair tests pass. Existing commitments/settings remain accessible even when free cash is unavailable.
5. Enable exactly one scheduler owner for the environment, run mocked and controlled synthetic-tenant end-to-end verification, then verify scheduled evaluation without page visits. Use the existing secrets; no new environment variables are required.
6. Record verification evidence and outstanding deployment/manual checks. Update user/runbook/architecture documentation only to match verified behavior, without presenting planned provider sync or separate email alerts as live.

Rollback: stop the new dispatch workflow, retain additive data/history and cash inputs, and hide new financial assertions behind unavailable states. Do not roll back to mixed-currency summation or legacy GET-generated risk events. Destructive schema rollback, historical merge/delete, production SQL application, and scheduler activation need separate reviewed authorization.