# CommitGuard Operations Runbook

This runbook covers CommitGuard commitment tracking, detection review, lifecycle actions, and CashPlan integration for local, preview, and production environments.

Existing module paths (not end-to-end remediation or deployment evidence):

- Commitment summary, detection queue, lifecycle actions, timeline, and settings have existing code paths.
- The CashPlan adapter exists; an adapter response alone does not prove forecast consumption.
- Existing paths reference Tax Buffer, SpendLeak, and Cost Guard signals where available.

**Cash-protection remediation: UNMERGED / NOT DEPLOYED.** Local storage,
saved-input/read contracts, durable work, operational/risk evaluators and alert
history paths and section-7 controls/digest-event integration exist locally; this
is not deployment evidence or a task-completion certification. The task ledger
records completion separately; no checkbox is changed by task 8.5.
The Railway code gate remains OFF. Shared SQL application and scheduler activation
require separate authorization. The bounded CashPlan paths now exist locally;
[§1.6](#16-bounded-cashplan-consumption--local--unmerged--not-deployed) supersedes
earlier section-8-pending notes, not rollout acceptance. The current
[workspace contract](#14-current-workspace-controls--unmerged--not-deployed) and
[digest boundary](#15-existing-digest-only-delivery--unmerged--not-deployed)
supersede older task-specific scope notes below. Task 3.8's [calculation reference](#57-calculation-and-summary-v2-reference--unmerged--not-deployed)
describes verified local code and fixtures only. See
[§5](#5-cash-protection-storage--unmerged--not-deployed) before any migration review.

Current cross-cutting review evidence (not sign-off):
[9.1 offline suite/build/48-diagnostic baseline](../release-notes/commitguard-task-9-1-verification-2026-10-19.md),
[9.2 isolated storage and narrow CashPlan ACL](../release-notes/commitguard-task-9-2-verification-2026-10-19.md),
[9.3 main synthetic browser run: 349 assertions](../release-notes/commitguard-task-9-3-verification-2026-10-20.md),
[9.4 scheduled-workflow evidence and digest blocker](../release-notes/commitguard-task-9-4-verification-2026-10-20.md),
and [9.5 source-reviewed rollout checklist](../release-notes/commitguard-task-9-5-rollout-checklist-2026-10-20.md).
**Rollout HOLD:** canonical digest child tables lack DELETE policies; same-period
regeneration reproduces P2002. This requires separate reviewed remediation, not
a waiver or an implicit policy addition. The shared target has not been queried
for this checklist; SQL application/activation and main acceptance review remain
pending. All section-9 checkboxes are unchanged.

## 1. Operational flows

### Task 6.5 due/renewal evaluator — UNMERGED / NOT DEPLOYED

- Internal evaluate dispatch now runs the real due/renewal evaluator on the same
	task 6.1 fenced tenant transaction. It does not use a GET, a separate database
	transaction, a sender, or an external service. Current effective advanced-alert
	access, module enablement and each category preference control publication.
- Due soon projects eligible active/upcoming/ending/review occurrences with the
	existing original-anchor engine over UTC `[today, today + 8 days)`: today through
	day 7 inclusive. Old recurring anchors advance mathematically; overdue one-offs,
	paused/archived/cancelled/expired rows and unsupported schedules produce no due
	alert. Due identity is commitment plus projected occurrence date.
- Renewal/notice identities contain commitment, renewal date, notice-close date
	and crossed positive unique configured threshold. First observation records only
	the most urgent reached threshold; later countdown days reuse that identity.
	Smallest threshold is urgent, second action-required, all remaining bands watch;
	outside the largest threshold is informational with no approaching event.
	Deadline day remains actionable; after it, the notice category records one
	immutable historical missed-deadline event, not daily approaching warnings.
- Evaluation updates relevance inside the fence: changed renewal/notice cycles
	supersede old history, elapsed occurrences/less urgent crossings resolve, and
	disabled categories/access/inactive rows suspend actionable history. Audit events
	and unrelated alert categories are untouched.
- **Current composition includes task 6.6.** Operational events and risk/amount
	evaluation run in one fenced transaction. Successful default dispatch returns
	200 completed and commits evaluation state/work completion together; daily work
	also records successful daily evaluation. Missing financial inputs complete as
	unavailable, without inventing a cash-risk alert. The earlier 202 dependency
	deferral is historical, not the current handler contract. No scheduler or mail
	is activated. See [risk verification](../release-notes/commitguard-risk-evaluation-verification-2026-10-19.md).
- Offline evidence: [task 6.5 verification](../release-notes/commitguard-operational-evaluation-verification-2026-10-19.md).

### 1.1 Commitment summary and free-cash calculation

CommitGuard summarizes upcoming commitments, renewal pressure, and free-cash risk.

Primary paths:

- `lib/commitguard/service.ts`
- `lib/commitguard/engine.ts`
- `GET /api/commitguard/summary`
- `GET /api/commitguard/cashplan`

Operational notes:

- The local v2 composition reads full required tax category reserves through a read-only adapter, not the legacy writing Tax Buffer summary. See §5.7 for currencies, coverage, quality and nullable outputs.
- The `/api/commitguard/cashplan` route remains an external adapter. The local
	CashPlan consumer instead uses the shared internal loaders/assembler (§1.6).

### 1.2 Detection queue and review

Primary paths:

- `lib/commitguard/detection.ts`
- `GET /api/commitguard/detections`
- `POST /api/commitguard/detections/[id]/review`

Review outcomes include confirm, ignore, not-a-commitment, and edit-driven confirmation paths.

#### Task 5.5 detection controls — UNMERGED / NOT DEPLOYED

- `POST /api/commitguard/detections` is the existing on-demand trigger, no body
	required. It returns `{detection: {created, updated, skipped, warnings?}, candidates}`.
	GET lists candidates; neither request is a provider sync. The service uses
	`withUserContext`, tenant serialization and current execution-access checks.
- Admission denial is 401/403; missing settings, module disable or detection
	opt-out is safe 409 with a machine code; invalid stored policy is 400; unexpected
	failures are safe 500. The local UI disables Detect for missing/disabled policy
	and legacy `confirmed` threshold, explains why and offers settings reload.
	The backend retains legacy confirmed policy readability; it generates no human
	confirmation. Settings offers only low/medium/high, with an explicit required
	review placeholder rather than silently choosing high.
- Review POST validates strict nonempty edit patches: name/category, nonnegative
	Int-capped cents, supported frequency, real UTC calendar suggested due date,
	confidence and source classification. No new currency/supplier/notes edit
	fields, tenant IDs, provider payloads or worker fields are accepted. Existing
	confidence API compatibility is retained; the UI offers low/medium/high only.
	Candidate DTO evidence is allowlisted to count/kind and source observation
	ID/date/amount/currency. The page forwards currency, supplier, safe UTC dates
	and evidence/conversion-review flags, not raw rows or connection/tenant IDs.
- Confirm retries return the original commitment; converted edit/ignore/reject
	returns 409 and that identity. Historical ambiguity returns review-required
	409. Missing/foreign candidates are identical 404; access/allowance failures
	403; invalid fields 400. Audit failure rolls back the action. Repeated ignore
	or reject is a no-op preserving baseline, timestamp and audit. Deliberate edits
	can reopen ignored/rejected candidates, not converted ones.
- Suppression reactivation requires two new distinct observation IDs or observed
	amount delta `>= max(500 cents, ceil(15% previous typical amount))`. Suppression
	baselines are not overwritten on each analysis. Owner corrections survive
	unchanged/new evidence; disagreement flags review instead of replacing values.
	Confirmation advances the observed anchor unless a due date was explicitly
	corrected. Separate connection/currency and bill/bank streams never inflate
	the configured minimum (2..10). Persisted partial evidence is explicitly warned
	about in the UI; manual Detect is not a completeness guarantee.
- Candidate list/pending count publishes together after review; Detect uses its
	returned list/results. A save-success/reload-failure offers read-only retry,
	preserving the successful mutation. Conflicts keep drafts and offer reload/
	existing-commitment navigation. The current shared workspace additionally
	refetches hero/horizon/upcoming/renewal/review state coherently (§1.4). The
	queue selector is pending/ignored/rejected, separate from upcoming filters.
- Task 5.4's completed successful accounting-spend run/import batch inserts a
	unique durable **pending detection request**. Failed/partial runs do not
	schedule automatic detection. Import success is independent of detector failure.
	Local task 6 claim/dispatch/lease/fence/retry/repair paths are described below;
	their scheduler remains disabled. Pending rows are not proof that automatic
	detection ran. Do not advertise jobs, alerts or mail as live.

Offline evidence and exact validation results are recorded in the
[task 5.5 verification record](../release-notes/commitguard-candidate-controls-verification-2026-10-19.md).

### 1.3 Commitment lifecycle and event history

Primary user-facing surfaces:

- `/dashboard/commitguard`
- `/settings/commitguard`

Primary routes:

- `GET/POST /api/commitguard/commitments`
- `GET/PATCH /api/commitguard/commitments/[id]`
- `POST /api/commitguard/commitments/[id]/actions`
- `GET /api/commitguard/timeline`
- `GET/PUT /api/commitguard/settings`

Supported lifecycle actions:

- `pause`
- `resume`
- `cancel`
- `confirm`

#### Tasks 4.3–4.4 lifecycle contract — UNMERGED / NOT DEPLOYED

The owner-approved local contract is enforced by the shared
[mutation helper](../../lib/commitguard/commitmentMutation.ts) and
[services](../../lib/commitguard/service.ts). This is not deployment or browser
acceptance evidence. Task 4.4 adds the durable request boundary below without
changing the owner-approved D5 matrix.

| Action | Allowed sources and result | No-op success | 409 conflict |
| --- | --- | --- | --- |
| Pause | active/upcoming/ending/review → paused; set pausedAt | already paused | cancelled/expired |
| Resume | paused → active; clear pausedAt | none | every other status |
| Cancel | active/upcoming/ending/review/paused → cancelled; set cancelledAt | already cancelled | expired |
| Confirm | active/upcoming/ending/review → confirmed confidence; preserve status and lifecycle dates | already confirmed in those statuses | paused/cancelled/expired, even if confirmed |

- Archived records reject every mutation with 409, including otherwise no-op
	actions. No archive action was added.
- PATCH accepts descriptive, schedule, renewal and classification edits, **not
	lifecycle status** (400, even when unchanged). Cancelled/expired records remain
	editable without being reopened. Unrelated legacy-custom edits retain the old
	rule; supported-frequency repair and explicit rule clearing remain available.
- PATCH/actions acquire the shared tenant advisory lock, refresh core access,
	lock the tenant-owned commitment row, then re-read current state. Missing and
	foreign IDs both return the same 404. Lost access returns safe 403.
- Mutation and audit are atomic. Changed-field metadata records before/after
	values, with ISO dates; unchanged fields are omitted. Successful retries of
	pause/cancel/confirm and identical PATCH return the current commitment with
	null audit, without touching updatedAt or appending history. Resume retries
	conflict once the first request has made the record active.
- Lifecycle conflicts return a safe message and `invalid_commitment_transition`
	or `commitment_archived`, not database errors or tenant identity. Mutation
	responses omit the commitment's tenant ID.

See the [task 4.3 verification record](../release-notes/commitguard-lifecycle-verification-2026-10-19.md)
for its historical mutation/audit-only results. The
[task 4.4 verification record](../release-notes/commitguard-mutation-handoff-verification-2026-10-19.md)
adds revision/work evidence. Neither establishes scheduler activation or email.

#### Task 4.4 revision and pending-work handoff — UNMERGED / NOT DEPLOYED

The existing [evaluation request helper](../../lib/commitguard/evaluationRequest.ts)
is now used by all material commitment mutation paths. One successful material
operation increments settings `calculationRevision` once and inserts one durable
`evaluate` item keyed by tenant + kind + `evaluation:<revision>`, with
`source_kind=mutation` and the committed revision. Absent settings initialize at
revision 1. No financial values or source payload are queued. DB defaults set
pending state, zero attempts/fence and null lease/completion. Restricted INSERT
columns and `RETURNING id` remain unchanged; no grants were widened.

| Operation | Revision / pending evaluation | Retry or conflict behavior |
| --- | --- | --- |
| Manual creation | Once with new commitment and creation audit | Existing allowance/access failure rolls everything back; no new manual-create idempotency key is introduced |
| New candidate conversion | Once with commitment, unique source link, converted candidate and conversion audit | Sequential/concurrent confirmation returns the original identity without another revision/work/audit, including at full allowance |
| Material PATCH | Once for any actual descriptive, monetary, schedule, renewal or classification change | Identical effective values return current commitment/null audit, without timestamp/revision/work writes; unchanged lifecycle status in PATCH is still 400 |
| Pause/resume/cancel/confirm | Once for an actual transition under the matrix above | Pause/cancel/eligible-confirm no-ops do not write; resume retry is 409; archived/source-status conflicts precede confidence no-op checks |
| Unambiguous legacy conversion-link reconciliation | None; existing obligation already participates in calculations | Repair only the uniquely proven link/candidate status and return the original; ambiguous/missing/conflicting proof is review-required 409 |
| Candidate edit/ignore/reject | None; review candidates are not forecast obligations | Existing review/audit behavior retained; evidence/suppression/no-op review refinements remain task 5, not an invented calculation trigger |
| Material settings save/import | Existing once-per-change handoff retained | Compare normalized effective policy before upsert; existing-policy no-ops preserve updatedAt and queue nothing |
| Cash-context / coverage writes | Existing material-change handoffs retained | Their existing expected-revision/coverage contracts and no-op behavior remain unchanged |

All these writers share the `commitguard:<userId>` tenant transaction advisory
lock. Commitment updates/actions also lock the owned commitment row and re-read
state; conversion locks/re-reads the owned candidate. The revision increment,
pending insert, financial mutation, candidate/link changes and applicable audits
are in the **same `withUserContext` transaction**, not an after-commit hook.
Any revision, pending-work or audit failure rolls back all of them. Unexpected
work-key collisions fail the operation rather than silently dropping evaluation.
Changed-field auditing and amount-alert thresholds are distinct: small amount
edits and disabled amount-alert preferences still invalidate the calculation.
Independent successful mutations serialize into distinct revisions; retries and
conflicts do not consume another revision. Missing/foreign records remain 404,
access/allowance denial 403, invalid inputs 400, D5 conflicts 409, and unexpected
storage failures safe 500; no raw database detail is returned.

**Handoff only, not activation:** the task 4.4 mutation path itself does not
enqueue Redis tasks, complete work, evaluate alerts, refresh CashPlan snapshots
or send mail. Pending rows prove durability, not execution/delivery. Local task 6
execution/recovery is described below, with exactly one scheduler owner still
subject to separately authorized activation. Task 7 owns coherent UI refresh.
No migration, shared database policy application or activation is authorized here.

### 1.4 Current workspace controls — UNMERGED / NOT DEPLOYED

This is the task-7.8 source-backed documentation snapshot, not new implementation
of 7.6/7.7, checkbox completion, authenticated browser acceptance or deployment.
See the [user guide](../user/commitguard.md) for exact visible controls and the
[verification record](../release-notes/commitguard-documentation-verification-2026-10-19.md)
for this pass's executable evidence and limits.

- [Workspace loader](../../lib/commitguard/workspaceLoader.ts) and
	[GET route](../../app/api/commitguard/workspace/route.ts) return a safe version-1
	workspace envelope containing the version-2 summary, cash inputs, settings,
	commitments, filtered upcoming page, candidates/count, renewals and alert page.
	One tenant-RLS RepeatableRead snapshot/clock binds `asOf`, `calculationRevision`
	and `cashInputRevision`. No defaults, work, events or snapshots are written.
	Current dashboard, overview and digest cash metrics use the saved-input summary
	and shared formatter; separate requests agree only at the same input revision
	and clock, not through a cross-request lock.
- [Client store](../../lib/commitguard/workspaceClient.ts) validates copied
	cash/settings/summary/revisions/count and URL selection before publishing all
	sections together. It rejects stale responses/server props and serializes
	writers. Confirmed saves followed by failed reads retain the previous labeled
	snapshot, block further mutation and offer **Retry workspace refresh (GET
	only)**. Recovery does not replay a successful mutation. The provider requests
	`router.refresh()` even on read failure; that call is not proof of completed
	Next.js server rendering. Unknown save outcomes require reload/review.
- [URL validation/selection](../../lib/commitguard/workspaceFilters.ts) supports
	`search`, `category`, `status`, `essentiality`, `frequency`, `source`, `currency`,
	`duePeriod`, `dueFrom`, `dueTo`, `sortBy`, `sortOrder`, `page`, `renewalPage`,
	`alertPage`, `eventId`, `commitmentId`, `linkedSpendInsightId`, `costGuardAlertId`.
	Unknown/duplicate/malformed query inputs fail validation; integer pages clamp
	to reachable bounds. Upcoming filters run before twelve-row slicing, preserve
	other navigation state and do not filter financial totals/renewals/candidates.
	Due filters inspect saved next-due dates, using UTC inclusive-from/exclusive-to
	boundaries, not projected occurrences. The default status set is
	active/upcoming/ending/review. Sort ties use stable identity.
- SpendLeak's `linkedSpendInsightId` and Cost Guard's `costGuardAlertId` select
	persisted relationships, not text matches. Renames do not change selection;
	foreign/missing IDs produce the same empty result. Event/entity targets remain
	tenant-scoped independently of upcoming filters. Never add a client `userId`
	override or put financial values into share URLs or diagnostics.
- [Commitment editor](../../components/dashboard/commitguard/CommitGuardCommitmentEditor.tsx)
	exposes category/confidence/essentiality/source, source amount/currency,
	supported recurrence/dates, renewal/notice/auto-renew/cancellable and descriptive
	fields. Lifecycle status remains actions-only under §1.3; archive is not added.
	Legacy custom schedules are retained for unrelated edits or repaired explicitly.
	No reviewed coverage editor or automatic FX is claimed.
- [Renewals](../../components/dashboard/commitguard/CommitGuardRenewals.tsx) are
	independently paginated eight at a time (`renewalPage`), with stable notice-date/
	identity ordering, source-currency annualization, dates, notice duration,
	auto-renew and remaining/missed decision windows. Annual factors are
	52/26/12/4/2/1 for weekly through annual supported cadences; one-off/custom
	amounts are unavailable, not guessed. Warning bands follow configured positive
	unique thresholds, not one event per countdown day.
- [Settings controls](../../components/settings/CommitGuardSettingsClient.tsx)
	expose module enablement, 7/30/60/90 default horizon, independent fixed-buffer
	currency, percent and 0–24 weeks. The dated weekly basis stays in owner cash
	inputs. Policy save/import never redates/relabels financial inputs. Warning text
	stays a draft through commas/clears; save requires 1–12 whole-day entries of
	1–365, then sorts/deduplicates. Empty lists are errors; use category toggles.
	Partial imports preserve omitted policy and dirty drafts. Missing weeks is not
	zero. Detection minimum is 2–10; legacy confirmed threshold needs review.
- Disable retains cash/records/history and editing, while suppressing active
	free-cash assertions, automated detection/evaluation and digest signals. The
	external adapter publishes no occurrences/protection/outflow contribution.
	The bounded local CashPlan assembler also suppresses commitment/linked-bill
	reads and contribution while disabled; independent dated manual items and saved
	gross cash remain. Source records and both snapshot generations are retained.
	See §1.6 for source boundaries, not a full-provider or rollout claim.

### 1.5 Existing digest-only delivery — UNMERGED / NOT DEPLOYED

[The event adapter](../../lib/commitguard/digestSignals.ts) is consumed by the
[existing digest provider](../../lib/ownersDigest/service.ts). It is read-only
under tenant RLS, not a generic notification framework or a new sender.

- Recheck module/core/advanced-alert access and current category preferences.
	Detection also requires detection entitlement, opt-in and a pending candidate
	whose evidence fingerprint matches. Current actionable occurrence/renewal cycle
	identity is revalidated; paused/cancelled/expired/archived/deleted commitments
	and resolved/suspended/superseded cycles are not upcoming signals.
- Preserve event/entity identity, original `occurredAt`, source currency and
	occurrence/renewal/notice dates. Event links use
	`/dashboard/commitguard?eventId=<owned-event-id>#event-<owned-event-id>` and
	history resolves their actual page; never replace source time with digest
	generation time. Period-scoped amount/detection information uses the existing
	digest bucket. Watch maps to warning with source severity retained; decreases
	are informational. Current provider rejects a summary/settings revision mismatch.
- Risk requires complete compatible summary, current same-day evaluation state,
	matching episode/status/revisions/currency/horizon and enabled preference. One
	risk event replaces its equivalent live-risk signal; fallback is only before
	any stored episode exists. Existing AUD `cash_pressure` correlation coalesces
	relevant tax/CashPlan/CommitGuard signals without adding their impacts. Other
	currencies use separate keys and no AUD financial-impact ranking amount; no FX.
- Existing digest ranking/materiality, source inclusion, enablement, email opt-in,
	`owners_digest_email` entitlement, recipient and cadence remain authoritative.
	[The existing mailer](../../lib/email/sendOwnersDigest.ts) alone performs delivery
	and rechecks access before sending. Its identity remains
	frequency + UTC period start + recipient scope; an already-sent record suppresses
  a sequential resend only if generation reaches that check. Task 9.4 reproduced
  canonical-RLS child replacement failing with P2002 **before** the delivery-key
  check on same-period regeneration; successful `already_sent` replay is not
  certified. See the [blocker report](../release-notes/commitguard-task-9-4-verification-2026-10-20.md#confirmed-local-blocker--digest-regeneration-with-canonical-rls).
  UTC period buckets and UTC-hour/day due checks are retained
	despite a stored timezone. Do not promise local-time scheduling or improved
	concurrent/crash exactly-once transport semantics.
- With digest/email disabled, frequency off, not-due cadence or missing/revoked
	email access, no extra CommitGuard delivery/subscription is created. History
	remains available under core access. A stored event, completed evaluator,
	generated digest snapshot or retry response is not an email receipt. There is
	no standalone immediate or weekly CommitGuard mail channel and no new env var.

For missing mail, first inspect authorized history/current relevance and quality,
then digest settings/cadence/access/materiality and the existing delivery status.
Use mocked transport for verification, never a real owner email. Do not print
balances, amounts, supplier names, recipients, source payloads or raw DB errors.
Scheduler activation/SQL/shared-environment calls still require §5.2 authorization.

### 1.6 Bounded CashPlan consumption — LOCAL / UNMERGED / NOT DEPLOYED

The [CashPlan runbook](cashplan.md#111-exact-included-source-boundary) is the exact
source contract. Summary/items/settings, the settings review page, overview cash
posture and CashPlan digest provider share the internal read-only assembler;
they do not HTTP-call this module's external adapter. Ancillary CashPlan calendar,
explanation/data-quality/periods/export and scenarios are not migrated here.

- Include compatible active occurrences, explicitly covered in-window unpaid
	imported bills with supported persisted balances, validated reconstructable v2
	source facts, and valid exact-target overrides/explicitly dated manual items.
	Current bill balances are numeric Xero `AmountDue` or MYOB `BalanceDue`, not bill
	totals, bank balances, arbitrary provider facts or full provider coverage.
- Opening cash is fresh owner-attested **gross cash**, never CommitGuard free cash.
	Tax reserves and safety buffers are protection, not extra forecast movements.
	There is no bank/provider cash sync, FX, broad receivable/payment ingestion or
	intervening-movement reconciliation. Every bounded forecast remains preliminary
	with missing receivables/partial payables; commitment-only and dated balance-age
	reasons remain explicit. Missing/stale/mismatched cash yields unavailable money.
- An included 6000-cent bill against a 10000-cent occurrence leaves 4000 cents of
	commitment outflow. Paid/absent/excluded/incompatible/out-of-window/unsupported
	bills restore the gross residual and request coverage review. Overrides apply
	before deductions; no supplier/amount/date similarity deduction is allowed.
- Current subscription access, including Essentials core fallback, is resolved
	at execution. Disable suppresses this module's contribution, not retained cash,
	manual plans or history; revoked subscription blocks reads. No new CashPlan gate.
- GET/page/overview/CashPlan-provider reads perform no financial/default/event/work
	or CashPlan snapshot writes. Only explicit summary POST or the trusted fenced
	evaluation job appends snapshot v2. The scheduler gate remains OFF.
	Snapshot anchors/currency/revisions/source metadata/coverage/quality/hash must
	validate against current sources. Legacy and superseded v2 snapshots remain
	unchanged history, never merged with current occurrences or overwritten.

[Task 8.5 integration fixtures](../../tests/cashplan-canonical-consumers.test.ts)
exercise actual route/service consumers with synthetic transactions and fail-closed
GET guards. Overview page wiring is checked statically, its formatter and settings
page are executed; this is not authenticated live Next.js, RLS, provider, scheduler
or delivery acceptance. No external DB/API/email or task checkbox changes.

## 2. Environment variables

### Task 6.3 queue and recovery — UNMERGED / NOT DEPLOYED

The [Railway extension](../../worker/paidsoon_worker/commitguard.py) belongs to
the **existing single Beat owner**. Its
[code release gate](../../worker/paidsoon_worker/config.py) is false; no Beat
entry is installed and even direct dispatcher invocation is inert. This is not
authorization to enable, deploy, apply SQL, or create infrastructure. No new
environment variable, scheduler service, Vercel cron, Redis data dependency or
email transport is introduced. Existing Railway/Redis remain transient delivery;
Postgres is authoritative for all work lifecycle state.

- Authenticated `POST /api/internal/jobs/commitguard/dispatch` accepts only
	optional `dailyCursor` and `repairState` pagination hints. It scans at most 100 enabled tenants by keyset and
	calls current `getFinancialJobAccessSkip(userId, "commitguard_core")` before
	daily creation. Denied tenants still advance the cursor. The worker retains
	only an in-process pagination hint; restart repeats discovery safely.
- Daily identity is `daily:<YYYY-MM-DD>` from the database UTC clock, independent
	of calculation revision/generation. Uniqueness preserves existing pending,
	skipped, completed and exhausted rows. Current settings are re-read under the
	tenant lock. A subsequent mutation has its own newer-revision work; stale
	evaluation is skipped without touching that newer work. Detection source jobs
	remain independent and use current settings, not ingestion revision zero.
- Separate bounded scans recover at most 100 expired processing/pending-exhausted
	rows and discover at most 100 due pending rows ordered by next attempt/id.
	Enqueue failures leave pending rows intact, continue other identities, and
	log only fixed safe codes/counts. Duplicate deliveries are claim/fence-safe.
	The five-minute cadence does not promise immediate delivery or unlimited
	throughput. Task 6.4 adds the independent source completion-gap pass below.
- Claims increment attempts/fence and obtain 60-second owner leases. The private
	side-effect helper renews only **unexpired, matching-owner/fence** leases in
	its initial/final atomic assertion, with current access/settings/revision checks.
	It never exposes an asynchronous role-elevation callback or runs a second
	connection/timer while holding the work lock. Financial transactions retain
	the existing 15-second timeout, shorter than the lease. An expired/wrong-fence
	worker rolls back; renewal cannot resurrect it. Recovery waits for the same
	tenant -> work lock order, clears the old owner, and schedules backoff.
- Execution failures and crashes count toward six attempts. Backoff is
	60/120/240/480/960/1920 seconds, additionally subject to five-minute discovery.
	The sixth failure/recovered expired lease is `failed`, not automatically
	recreated. Current-access/module skips before claim delay pending work five
	minutes without charging attempts, so restoration remains recoverable.
- **Current evaluator:** tasks 6.5/6.6 now run by default in
	[dispatch](../../lib/commitguard/jobDispatch.ts), returning 200 completed/skipped
	or safe 500 on execution failure. Events/relevance, staged evaluation state
	and completion commit only with final access/revision/lease/owner/fence checks.
	Daily success is recorded only for committed daily evaluation. The generic
	lifecycle helper retains dependency-deferral handling, but default dispatch
	no longer emits `evaluation_pipeline_pending` or refunds successful claims.
	The full rollout gates still apply; no scheduler is activated.

**Retry procedure:** inspect failed work using approved private operational access
(state, pending age/requested date, attempts, generation, next-attempt date,
safe reason; counts only in logs). Never print balances, suppliers, recipients,
source payloads, lease owners or fences. An already elevated platform admin/owner
can POST `{workItemId,expectedGeneration}` to
`/api/admin/tenants/[id]/commitguard/retry`. The service rechecks the trusted role
and nonrevoked/unexpired session in the atomic update. It appends generation
summary and trusted actor/session to private `attemptHistory`, increments
generation, resets attempts to zero and leaves source/revision/dedupe/fence intact.
Only a matching failed generation can change; repeated/stale/foreign/nonfailed
requests return safe 409, successful retry returns only `{status:"pending"}`.
The internal worker secret cannot authorize this action. Do not edit work rows,
delete history, change canonical keys or use Redis retry counters as a substitute.

**Storage/security prerequisite:** existing work lifecycle fields are sufficient;
no schema change is added. The narrow `prismaAdmin` exception in scan/claim/
lifecycle touches metadata only. Financial writes remain RLS-scoped. Tenant
work INSERT retains restricted columns/pending defaults and now excludes the
executor-only daily namespace in both targeted and canonical policy artifacts.
No UPDATE/DELETE permission is widened. Review/apply only CommitGuard SQL in the
existing documented migration order with separate authorization; do not execute
the full canonical policy file or unrelated trial/billing SQL. No SQL was applied
as part of these mocked tests. Isolated PostgreSQL policy/transaction verification
remains required; mocked tests do not establish PostgreSQL ACL enforcement.

Offline verification is recorded in the
[task 6.3 verification record](../release-notes/commitguard-queue-verification-2026-10-19.md).

### Task 6.4 source completion repair — UNMERGED / NOT DEPLOYED

The [source repair scanner](../../lib/commitguard/sourceRepair.ts) extends the
same authenticated dispatch call and disabled Railway owner; it adds no schedule,
activation, schema/policy change, environment variable or external dependency.

- A server-database UTC date starts one daily pass. Each five-minute tick reads
	at most 100 missing accounting sources and 100 missing spreadsheet batches,
	with independent source-ID keysets. The worker carries the date, cursors and
	per-stream completion flags in `repairState`. Once both streams finish, source
	queries stop until the next UTC day. Restart loses hints only and safely
	repeats discovery. Late completions behind a cursor are revisited next day.
- The documented system metadata-discovery exception reads only source IDs,
	tenant IDs, completion predicates and canonical work identity. It does not
	load spend rows, suppliers, amounts, recipients or entitlement snapshots.
	Accounting eligibility exactly matches task 5.4: `success`, nonnull completion,
	zero skipped invoices. Spreadsheet eligibility is `completed`, nonnull
	completion, zero failed and skipped rows. No additional guessed spend marker
	or requirement for a nonzero imported-row count is introduced.
- Missing means no `(tenant, detect, detection:<source-kind>:<source-id>)` work
	row, regardless of its state, generation or source-column contents. Existing
	pending/processing/completed/skipped/failed work is never reset or recreated;
	exhausted generations still require the separately authorized retry action.
	A noncanonical spoofed key or another tenant's key cannot suppress repair.
- Every insertion uses `withUserContext`, tenant lock and the original task-5.4
	completion helper, rechecking ownership/completion after discovery. Its minimal
	parameterized INSERT leaves pending state/counters/generation/lease defaults
	database-owned and uses targetless `ON CONFLICT DO NOTHING`. A race with the
	completion writer or another repair is a no-op, including an exhausted row.
- An individual source failure increments `repairFailed`, emits only the fixed
	`source_repair_failed` code and advances the page rather than starving later
	sources. The next daily pass retries the gap. `repaired` counts new durable
	requests, not executions or successful evaluations. Normal pending discovery
	follows repair in the same call; lost enqueue remains rediscoverable.
- No financial detection runs during repair. Current module, opt-in and access
	checks remain execution-time responsibilities. Repair counts prove only new
	pending requests, not detection, evaluator completion or email delivery.

See the [task 6.4 verification record](../release-notes/commitguard-source-repair-verification-2026-10-19.md)
for historical mocked coverage and outstanding deployment/storage checks. Its
task-status snapshot is historical; it is not the current task ledger.

CommitGuard introduces no new environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- Existing auth and database configuration.
- Upstream accounting and spend data variables when detections rely on imported/provider data.
- Existing `INTERNAL_JOBS_SECRET` authenticates both internal POST routes. No
	dedicated module-only cron or secret is required. See the
	[central matrix](README.md#railway-environment-variable-matrix).

### Task 6.8 operator procedures — UNMERGED / NOT DEPLOYED

#### Authentication and single-owner gate

Both [execution](../../app/api/internal/jobs/commitguard/route.ts) and
[discovery/repair](../../app/api/internal/jobs/commitguard/dispatch/route.ts)
require `Authorization: Bearer <existing INTERNAL_JOBS_SECRET>` from the approved
secret store for the matching environment. Missing, empty, unconfigured or wrong
credentials return 401 before database work. Never paste credentials, cookies or
headers into tickets, examples, logs or shell history. Do not generate a second
CommitGuard secret. `CRON_SECRET` and `WORKER_TRIGGER_SECRET` do not authorize
these routes. A protected Preview deployment additionally needs the existing
automation-bypass header supplied by the
[worker API client](../../worker/paidsoon_worker/api_client.py); this is not a
replacement for route authentication.

| Action | Exact route and JSON contract | Authority / result |
| --- | --- | --- |
| Discover daily work, repair source gaps, recover leases, list due work | POST `/api/internal/jobs/commitguard/dispatch`; `{}` starts discovery, or optional nullable `dailyCursor` / `repairState` from its previous response | Existing internal-job bearer; identity-only `jobs`, cursor/repair hints and `recovered`, `repaired`, `repairFailed` counts; safe 400/401/500 |
| Execute one persisted identity | POST `/api/internal/jobs/commitguard`; `{userId,workItemId,kind}`, kind exactly `detect` or `evaluate` | Same bearer, then tenant/item/kind/source matching and current access; 200 completed/skipped, safe 400/401/500; no financial response |
| Retry one failed generation | POST `/api/admin/tenants/[id]/commitguard/retry`; `{workItemId,expectedGeneration}`, tenant selected in `[id]`, never in body | Existing authenticated elevated platform-admin/owner session, not worker bearer; 200 `{status:"pending"}`, 409 `{status:"not_retryable"}`, safe 400/401/403/500 |

All bodies are strict: never add financial values, permissions, source overrides,
lease owners or fences. Dispatch returns private routing identities, not a public
diagnostic export; retain those only in the trusted dispatcher, not logs/tickets.

Exactly one existing Railway Beat owner per database/environment owns the
five-minute extension. `Config.COMMITGUARD_DISPATCH_ENABLED = False` is a **code
release gate**, not an environment variable. With it off, no CommitGuard Beat
entry is registered and direct `dispatcher.dispatch_commitguard` invocation is
inert. The internal HTTP routes themselves are not disabled by that Python gate:
**do not call them against a shared environment without separate authorization**.
No Vercel cron, second Beat replica, additional scheduler, Redis-backed authority
or new email transport is permitted. Existing unrelated Railway jobs are not
proof that this extension is deployed. Confirm target mapping, SQL/ACL review
and synthetic acceptance under [§5.2](#52-ordered-review-gate--not-authorization-to-deploy)
before requesting activation; a passing offline test is not approval.

#### Privacy-safe backlog and failure diagnosis

There is no new backlog dashboard/CLI or public cross-tenant inspection route.
Use approved **private read-only operational access** to the authorized target;
do not widen tenant grants or use `SELECT *`. Capture observation time and
aggregate counts by kind/state/attempt count/safe failure code, oldest requested
age, overdue next-attempt age and age of last successful daily evaluation. For
example, this read-only aggregate excludes identities and financial payloads:

```sql
SELECT kind, state, attempts, safe_error_code,
		 count(*) AS work_count,
		 max(extract(epoch FROM
			((clock_timestamp() AT TIME ZONE 'UTC') - requested_at))) AS oldest_age_seconds,
		 max(CASE WHEN state = 'pending' THEN greatest(0, extract(epoch FROM
			((clock_timestamp() AT TIME ZONE 'UTC') - next_attempt_at))) END) AS overdue_seconds
FROM public.commit_guard_work_items
GROUP BY kind, state, attempts, safe_error_code
ORDER BY kind, state, attempts, safe_error_code;
```

For daily freshness, privately aggregate enabled tenants with missing/aged
`lastSuccessfulDailyEvaluationAt` from evaluation state; a completed mutation or
detection is not successful daily evaluation. Disabled gating can legitimately
leave old pending rows and absent daily timestamps. There is no guaranteed
completion latency or hard-coded operational alarm threshold.

For a specific retry decision, privately select only the chosen work ID, kind,
state, generation, attempts, requested/next-attempt/completed dates and
`safeErrorCode`. Tenant scoping stays in the private query predicate. Never
export cash/amounts, suppliers, recipients, commitment text, source evidence,
raw provider/DB errors, lease owners/fences, headers or private `attemptHistory`.
The tenant SELECT grant excludes generation/next-attempt/internal fields; do not
widen it to support this operator view.

| Observation / fixed diagnostic | Safe interpretation and next step |
| --- | --- |
| Pending grows; `enqueue_failed` | Redis delivery may have failed; durable rows remain. Check the single authorized owner/broker and rediscovery, not claim deletion. |
| Processing ages past lease; `lease_expired` | Let the bounded recovery scan obtain tenant → work locks; old owners cannot publish or renew after expiry. Do not steal/reset leases manually. |
| `no_access`, `feature_not_available`, `module_disabled`, `detection_disabled` | Current admission skip delays pending work five minutes without charging attempts; restoration uses ordinary discovery, not forced completion. |
| `superseded`, `invalid_source` | Terminal skipped work, not retryable failed work. Newer mutation work is independent; investigate canonical source metadata privately, without source payloads. |
| `execution_failed` / `access_changed` | Post-claim settlement retains charged attempts/backoff; six attempts exhaust. HTTP logs may instead show the fixed `internal_job_failed` code. |
| `dispatch_scan_failed`, `source_repair_failed` | Scan failure preserves worker hints; an individual source repair failure increments `repairFailed` and advances. Diagnose storage/authorization privately; do not log thrown errors. |

Each tick bounds enabled-tenant discovery, expired/pending-exhausted recovery and
due-pending discovery independently to 100 each; repair adds at most 100 accounting
sources and 100 batches. Daily identity `daily:<database UTC date>` is unique per
tenant even across revisions/generations. Claims use renewable **60-second**
leases; only matching unexpired owner/fence assertions renew them inside the
same financial transaction (15-second timeout), not an independent timer.
Failure/crash backoff is 60/120/240/480/960/1920 seconds, with rediscovery on the
five-minute cadence. The sixth failure/expired attempt becomes failed; there is
no automatic seventh attempt or recreated generation. A computed backoff does
not promise execution at that exact time.

#### Repair and failed-generation retry

1. Confirm authorized target, one scheduler owner, gate/rollout posture and safe
	counts first. Leave the gate OFF and perform no shared action in this task.
2. For a **missing request** after successful ingestion, let the authorized
	dispatcher call POST `/api/internal/jobs/commitguard/dispatch` and carry its
	returned pagination hints on subsequent ticks. A separately authorized manual
	authenticated `{}` request starts a bounded replay; it writes work/recovery
	metadata but does **not** enqueue the returned jobs. Only the trusted existing
	worker delegates those identities through the execution route. There is no
	dedicated repair CLI, and no need to bypass the disabled dispatcher.
3. The normal repair pass starts once per database UTC date and continues across
	bounded ticks until both streams finish. Restart can replay hints safely;
	late completions and individual failed repairs behind the cursor are revisited
	next day. Accounting requires `success`, completion date and zero skipped
	invoices; spreadsheet batches require `completed`, completion date and zero
	failed/skipped rows. Failed/partial sources are not automatically processed.
4. Existing canonical work in **any** state/generation is not a gap. Repair never
	resets pending/processing/completed/skipped/failed rows or revives exhaustion.
	If work is failed, inspect its safe code and current generation privately and
	address the cause before using the exact admin retry route above.
5. Authenticate and elevate through the existing admin flow; submit the selected
	failed work ID and observed `expectedGeneration` in that session. The atomic
	update rechecks active platform-admin/owner role and unrevoked/unexpired admin
	session. It retains prior generation/attempt/reason plus trusted actor/session
	in private history, increments generation, resets attempts, and preserves
	source/dedupe/revision/fence. A stale/repeated/foreign/nonfailed request is 409:
	re-inspect, do not loop or edit rows. Worker bearer alone is insufficient.
6. A 200 pending retry means eligible for later discovery, **not** execution or
	mail delivery. Monitor counts/age/attempts/safe codes and daily success after
	the authorized owner runs. Never delete claims/history, change canonical keys,
	run raw UPDATEs or use Celery retry counters as a recovery substitute.

#### Alert history is not an email receipt

Local task 6.7 exposes tenant-scoped GET `/api/commitguard/alerts` with optional
`page` and `eventId`, subscription/core access and no-store responses. Twelve
entries per page are reachable through `/dashboard/commitguard#commitguard-alerts`
with `alertPage` navigation; event links select the event's actual page and related
commitment/detection/cash-input targets. Reads do not run evaluation or write work.
The UI distinguishes active-at-last-evaluation, resolved, superseded, suspended
and historical records and reports evaluation unavailable/awaiting refresh.
Historical impact is not current risk, and an empty history is not proof of SAFE
or of scheduler health. Related-record access remains tenant scoped.

Financial context displayed to its authorized tenant is **not** an operator log
format; do not copy it into diagnostics. There is no acknowledgment or separate
immediate-email sender. Relevant-event consumption now exists locally under
[§1.5](#15-existing-digest-only-delivery--unmerged--not-deployed), with task 7.7's
checkbox still unchanged; it is not deployment evidence. Existing digest settings, cadence,
entitlements, ranking, recipient and transport/dedup rules remain authoritative;
event persistence, evaluation completion, history visibility and retry acceptance
are not email receipts and do not guarantee immediate or exactly-once delivery.

Source/tests and this documentation pass's verification are indexed in the
[task 6.8 verification record](../release-notes/commitguard-operations-docs-verification-2026-10-19.md).

## 3. Operational boundaries

- CommitGuard is the system of record for commitment lifecycle state, not Cost Guard or SpendLeak.
- Detection is deterministic and evidence-based; the queue should not be described as AI-generated.
- CommitGuard does not own CashPlan forecast persistence. Do not equate its adapter with verified CashPlan consumption.

## 4. Troubleshooting

### 4.1 Detection queue is empty when recurring spend exists

Likely causes:

- The tenant lacks the `commitguard_detection` feature.
- Source spend evidence is stale or does not meet recurrence and variance thresholds.

Actions:

1. Confirm entitlement for detection features.
2. Review recent SpendLeak or accounting input freshness.
3. Verify the supplier and amount pattern is consistent enough to form a detection candidate.

### 4.2 Free-cash output looks wrong

Likely causes:

- Owner cash or the selected buffer basis is missing, stale or currency-incompatible.
- Required tax context or reviewed coverage is missing or changed.
- Upcoming commitment dates or amounts are stale.
- The caller is comparing CashPlan and CommitGuard outputs from different refresh points.

Actions:

1. Check current CommitGuard settings and active commitments.
2. For local v2, inspect saved balance/expense dates, selected horizon, independent currencies, and every quality reason/action. Missing is not zero or WATCH.
3. Compare `/api/commitguard/summary` and `/api/commitguard/cashplan` at the same clock/revisions; check §5.7. Do not pass financial query overrides or use GET as an alert trigger. Verify tax applicability and explicit coverage, not a reserve gap or guessed supplier match.

### 4.3 Lifecycle action fails or appears not to persist

Likely causes:

- The commitment is not in a valid state for the requested action.
- The caller lost ownership context or attempted an out-of-date record transition.

Actions:

1. Reload the commitment detail or dashboard list.
2. Check the current status before retrying `pause`, `resume`, `cancel`, or `confirm`.
3. Review the timeline output to confirm whether the event was already recorded.

## 5. Cash-protection storage — UNMERGED / NOT DEPLOYED

### 5.1 Artifact and access boundary

[DDD §6.3.1](../DDD.md#631-commitguard-cash-protection-storage)
lists all new models/fields, compatibility defaults and ACLs. Source artifacts:

- [Generated migration](../../prisma/migrations/20261018111014_fix_commitguard_cash_protection_workflows/migration.sql): four new tables, 26 added columns, 15 explicit indexes/four primary-key indexes and eight RESTRICT FKs; no trial/billing column changes.
- [Supplemental CHECK transaction](../../prisma/commitguard-constraints.sql): 23 validated row constraints; apply **once**, after the schema migration. It is not rerunnable or part of Prisma migration tracking.
- [Targeted RLS/column grants](../../prisma/rls-commitguard-policies.sql): four new tables only, ten policies, repeatable policy/grant reset; execute atomically as schema owner. The marked block matches [canonical RLS](../../prisma/rls-policies.sql); do not execute the whole canonical file.
- [Targeted CashPlan dependency](../../prisma/rls-cashplan-commitguard-policies.sql): approved local-source/isolated-test scope only; apply after the targeted CommitGuard policies only with separate target authorization. Three tables/five policies: plan SELECT, plan-owned override SELECT/allowlisted INSERT, plan-owned base-snapshot SELECT/allowlisted INSERT with null scenario; no client UPDATE/DELETE or plan creation. Unknown overlapping client policies cause an abort, not silent cleanup.
- [Pure legacy report](../../lib/commitguard/legacyConversionReport.ts): unique audit evidence only. The unmerged task 4.2 confirmation path loads tenant history and reconciles a uniquely proven original link on demand; no mass backfill or automatic review-flag writes exist. Missing/duplicate/conflicting history must remain intact for review.

Cash is owner-attestation storage, not provider-bank ingestion. Cash and weekly
expense groups are independently all-or-none; negative/zero cash is valid.
Pure currency/freshness validation, the task 2.2 endpoint, task 2.5 dashboard
form, task 3.7 read composition and section-7 shared consumers exist locally;
deployment and section-8 CashPlan consumption remain pending. Nullable legacy buffer
currency and version-1 snapshot defaults preserve unknown provenance instead of
fabricating AUD, balances, dates or canonical source facts.

Authenticated cash access is own-row SELECT plus allowlisted INSERT/UPDATE, no
DELETE. Coverage permits own-row CRUD but cannot reassign owner/id. Work allows
only own-row safe-column reads and initial pending inserts; no lifecycle writes.
Evaluation state is own-row readable/system-write-only. No PUBLIC/anon grants
remain on the four new tables after targeted SQL. Existing profile, trial,
journal, reservation and effective-access privileges are **not** activated or
replaced by it.

**Work requests require explicit selection:** the only tenant-readable columns
are `id`, `kind`, `state`, `attempts`, `requested_at`, `completed_at`,
`safe_error_code`, `created_at`, `updated_at`. Use explicit ORM `select` on reads
and inserts; default return-all, `SELECT *` and `RETURNING *` are denied. Never
widen the grant to accommodate an ORM default. Lease/fence/generation/source/
dedupe/revision/history are internal. Initial state/counters/lease/completion
come from DB defaults, not client-supplied fields.

**Storage limits:** positive Int coverage is not an aggregate cap. The unmerged
task 3.6 services (§5.6) serialize tenant changes and validate aggregate occurrence
and unpaid-bill caps, currency and live targets; storage alone does not. Work storage does not implement D7
locks/fences/access checks, enqueue/repair/retry or a scheduler. Unique conversion
storage does not implement atomic conversion or allowance races. No feature
end-to-end acceptance, live scheduler or guaranteed immediate email is claimed.

### 5.2 Ordered review gate — not authorization to deploy

The [task 9.5 checklist](../release-notes/commitguard-task-9-5-rollout-checklist-2026-10-20.md)
records the current source-reviewed sequence and hard stops. Actual shared-target
migration/policy state has **not** been inspected for it; the predecessor names
below are repository order, not a claim that those migrations are target-pending.
The new task-9.4 digest DELETE-policy/P2002 blocker requires separate approval
and remediation; neither targeted artifact below fixes or waives it.

1. Identify the actual target and inspect its migration ledger, pending SQL,
	catalog and role/table/column ACLs read-only under separate authorization.
	Capture profile billing columns, trial grants/operations/notifications/risks,
	customer mutation journals/steps, reservation columns and effective-access
	inputs. Preserve existing containment/restrictions and inbound relations.
2. Review **every pending predecessor** against that target. In repository order,
	the CommitGuard migration follows trial schema `20261014093943_add_superuser_tenant_trial_access`,
	webhook lease `20261015060205_add_billing_webhook_processing_lease`, and
	customer journal `20261015095612_add_tenant_billing_mutation_journal`.
	Their presence in scratch is not approval to apply them elsewhere. There is
	no blanket `prisma migrate deploy` approval; `migrate dev --create-only` can
	apply predecessors and must not be used against a shared DB.
3. Review the additive CommitGuard migration and legacy state first: uniqueness,
	RESTRICT inverse FKs/profile-erasure order, existing data and lock impact.
	Preserve null cash/currency/conversion fields; no guessed backfill. A future
	authorized loader/report and reviewed reconciliation are separate work.
4. Only after target-specific authorization, apply the reviewed generated
	migration, then the **entire supplemental CHECK transaction once**, then
	**only the targeted CommitGuard policy artifact inside one owner transaction**.
	Keep new tables unavailable to application/Data API access through the schema/
	CHECK/policy gap; review actual default grants rather than assuming Supabase
	defaults. Verify all 23 CHECK names/validation flags before skipping an
	already-applied step; duplicates/invalid rows require review, not constraint
	removal. Do not run unrelated trial/billing supplemental SQL or canonical
	RLS as a shortcut. Temporary scratch auth scaffolding is never deployable SQL.
   **Next apply the separately reviewed targeted CashPlan dependency**, atomically
   as schema owner, after the targeted CommitGuard policies. The complete sequence
   is additive migration → supplemental CHECK transaction → targeted CommitGuard
   policies → targeted CashPlan policies. CashPlan's approved scope is local source
   and isolated verification only, not shared application. Review target table and
   column ACLs, plan ownership and overlapping policies; stop on the artifact's
   unknown-policy abort. Preserve unrelated operations/roles/default/profile/trial
   permissions and keep application/Data API access contained until verification.
5. Compare target before/after schema and ACL baselines allowing only reviewed
	additions and inverse FK changes. Exercise tenant isolation and profile/trial
	permission probes on an approved synthetic target. Scratch catalog equality
	does not prove live effective-access behavior or deployed permissions.
6. Keep automated dispatch disabled. Later compatible readers/services/forms,
	legacy reconciliation, tenant locks, job authentication/fencing/repair and
	synthetic end-to-end acceptance must pass before selecting exactly one
	scheduler owner per environment. No scheduler or new mail sender is enabled
	by this storage change.

Rollback is non-destructive: stop any future new dispatch, retain additive rows
and audit history, and withhold unsupported financial assertions. Do not delete
commitments, merge history, drop tables or restore unsafe mixed-currency/GET-write
behavior. Shared SQL application, cleanup/backfill and scheduler activation each
require separate review/authorization.

### 5.3 Isolated verification and remaining limits

See [2026-10-19 commands/results](../release-notes/commitguard-storage-verification-2026-10-19.md).
The verifiers hard-pin PostgreSQL 17 socket `/tmp/paidsoon-commitguard-pg.i62Iri`,
port `55437`, user `syspac`, TCP disabled. No default environment DB URLs are used
for database operations.

- [Schema replay verifier](../../scripts/verify-rls-commitguard-schema-baseline.mjs) creates a second disposable database on that same cluster; reads/replays the first 55 historical migrations using pinned Prisma 6.19.0 **explicit `--url` only** from outside repository config discovery. It compares the full logical catalog before/after the new migration, allowing only reviewed tables/columns/indexes/FKs and inverse FK triggers. No migration history is edited; no supplemental CHECK/policies are applied to the replay DB.
- [CHECK verifier](../../scripts/verify-rls-commitguard-constraints.ts) verifies 23 persistent scratch CHECKs and rolls back all fixtures. Its optional `--apply` persists CHECK DDL once; do **not** rerun it on already-constrained scratch.
- [RLS verifier](../../scripts/verify-rls-commitguard-policies.ts) captures the original baseline, sets up synthetic legacy policies/grants and any missing local Supabase auth compatibility, captures the application baseline, actually applies targeted SQL twice, compares every unrelated schema/ACL/policy, and rolls everything back to the original catalog. Its auth scaffolding/legacy setup are temporary test-only objects, never a deployed ACL baseline.

Baseline equality includes trial grants/operations/notifications, billing risks,
customer mutation journals/steps and the profile's durable reservations and
effective-access inputs. It is synthetic **schema/ACL preservation**, not proof
of production trial behavior, financial workflows, concurrency or browser/job
acceptance. Those broader checks and actual-target rollout remain blocked on
their own implementation and authorization.

### 5.4 Cash-context endpoint — UNMERGED / NOT DEPLOYED

Task 2.2 adds [GET/PUT /api/commitguard/cash-context](../../app/api/commitguard/cash-context/route.ts).
Task 2.5 adds its dashboard form (§5.5), without changing this API. Both methods
require a valid server-authenticated session, current subscription
access and `commitguard_core`, not Tax Buffer/detection/advanced-alert access.
All data access uses `withUserContext`; no schema/ACL changes or deployment are
part of this endpoint task. Apply none of the pending migration/policy artifacts
without the separate review in §5.2.

- No query parameters are accepted. GET returns `{cashContext}` with nullable
	`amountCents`, `currency`, `balanceAsOf`, `weeklyOperatingExpensesCents`,
	`weeklyExpensesCurrency`, `weeklyExpensesAsOf`, `taxProtectionCurrency`,
	`revision`, UTC `asOf`, `source: owner_entered`, `freshness` and
	`weeklyExpensesFreshness`. No tenant ID, row ID or work metadata is returned.
	Missing rows return null inputs/revision 0; GET creates no settings, audit,
	work, snapshot or other financial rows.
- PUT requires integer `expectedRevision` and accepts the seven optional input
	fields above, no identity/internal fields. Cash and expense groups must each
	supply all three fields or three nulls. Omitted groups remain unchanged;
	`taxProtectionCurrency: null` clears only that attestation. Cash cents may be
	negative/zero; expenses are nonnegative. Cents and revisions fit Prisma Int.
	Currency is lowercase `aud|usd|nzd|gbp|eur|cad|sgd|hkd`; dates are real
	nonfuture UTC `YYYY-MM-DD`. Currency changes never relabel retained expenses
	or fixed buffers. Balances/bases remain fresh through day 7, stale on day 8.
- Responses: `200 {cashContext}` after save/no-op; `401` invalid session; `403`
	denied subscription/core access; `400` invalid JSON/body/query; `409` stale
	revision, first-create uniqueness race or exhausted cash revision. Reload GET
	and explicitly reconcile before retrying a conflict. Unexpected failures are
	safe `500`s; subscription verification unavailable is `503`.
- A material save holds the shared tenant advisory lock (key `commitguard:` plus
	authenticated user ID), then cash row lock, with conditional revision update.
	First creation is serialized despite there being no cash row to lock. Future
	D5/D7 services must reuse [the same lock helper](../../lib/commitguard/tenantLock.ts)
	before work/financial locks. Those other services are **not changed** here.
	Cash revision, settings `calculationRevision` increment, initial pending
	evaluation and changed-field-only audit commit or roll back together. No-op
	saves still require the current expected revision, but add no revision, row,
	audit or work. Clearing already-missing inputs is therefore also a no-op.
- Work dedupe is tenant + `evaluate` + `evaluation:<calculationRevision>`, with
	`source_kind=mutation`. No balance/source payload is queued. The
	[minimal request helper](../../lib/commitguard/evaluationRequest.ts) does not
	dispatch, claim or execute work. Workers must later validate canonical source
	and revision independently; a pending row proves no evaluation or delivery.
- Restricted grants require explicit selections: reads select only safe fields
	and inserts return `id` only. Prisma `create()` emits defaulted fields even
	when omitted from `data` (verified by offline SQL capture), including protected
	work state/counters/dates and cash `created_at`. These two inserts therefore
	use parameterized allowlisted SQL with DB defaults, not widened grants or
	explicit state/attempt/fence writes. Existing settings ACLs/writes remain the
	broad baseline; this task does not tighten them.
- `COMMITGUARD_CASH_CONTEXT_UPDATED` metadata contains only actual changed field
	names. Do not log request bodies, financial values, dates or raw DB errors.
	Diagnostics use a static failure message, not error objects. No provider API,
	emails, scheduler, UI, revised summaries or CashPlan consumption are added.

[Endpoint/service unit tests](../../tests/commitguard-cash-context-route.test.ts)
exercise the real mutation/helper with mocked tenant transactions and rollback,
not external databases/APIs. Mocked lock contention is not proof of live
PostgreSQL concurrency or deployed RLS; those acceptance gates remain separate.

### 5.5 Owner-input form contract — UNMERGED / NOT DEPLOYED

The [dashboard page](../../app/dashboard/commitguard/page.tsx) mounts the
[cash-context panel](../../components/dashboard/commitguard/CommitGuardCashContextPanel.tsx)
at `/dashboard/commitguard#cash-inputs`. Its
[form](../../components/dashboard/commitguard/CommitGuardCashContextForm.tsx)
loads GET with no cache and submits PUT to the existing endpoint only. The page's
authentication/plan boundary and endpoint's subscription/core/RLS boundary remain
unchanged. No schema, settings-policy, provider, mail or deployment change is
part of task 2.5.

- Three labeled groups cover gross cash, independent dated weekly expense basis,
	and tax currency only. Display source is owner-entered/not bank-verified.
	Missing/stale actions focus inputs; no automatic redating or re-attestation.
- [Pure client validation](../../lib/commitguard/cashContextClient.ts) converts
	decimal text exactly with integer arithmetic, then checks Prisma Int bounds
	and the existing all-or-none/date/eight-currency contract. Cash supports
	negative/zero, expenses nonnegative/zero. Partial groups have inline errors.
- Save sends `expectedRevision` from the displayed saved DTO plus all seven
	financial input fields. A blank complete group becomes three nulls, blank tax
	becomes null. No owner ID, source or internal state is submitted. Clearing is
	a draft operation until Save. Independent currencies are never inferred.
- A 409 does not reload or retry automatically. Drafts remain unchanged and Save
	is blocked. GET reload shows comparison values but does not change drafts or
	adopt the newer revision until the owner explicitly chooses it. The owner can
	instead explicitly discard drafts. Unconfirmed saves (including lost network
	responses) also require read/review before another save.
- Confirmed PUT success immediately adopts its safe DTO. A subsequent GET reload
	checks cash inputs, then calls `router.refresh()`. A newer revision observed
	during that read requires explicit comparison rather than silently attaching
	stale drafts to the new revision. GET/refresh-call failure is distinct from
	save failure: confirmed saved inputs remain and Retry load issues GET only.
	Save is blocked while that refresh warning is outstanding.
- Next's `router.refresh()` does not return server completion/failure. This form
	handles cash-context GET failure and synchronous refresh-call failure, not
	whole-workspace server render failures. It does not claim task 7.2's coherent
	workspace DTO or task 7.1's shared-consumer wiring is complete. Existing hero,
	horizon, renewal and digest calculations are not changed by this form task.
- Generic failures never display raw response bodies or log financial drafts.
	Controls are disabled in flight, errors are associated with their labels, and
	load/save/conflict states have accessible status/alert wording. No jsdom or
	other dependency is added.

Offline verification: the
[client tests](../../tests/commitguard-cash-context-client.test.ts) and
[React static-render tests](../../tests/commitguard-cash-context-form.test.ts)
cover exact cents/Int bounds, groups/dates/currencies, conflicts, safe response
validation, save/read separation, source wording and label associations.

Task 2.5 verification on 2026-10-19: the two new test files plus existing cash
contract, loader, route and dashboard page tests passed **52/52**. Affected ESLint
and whitespace checks passed. Repository-wide TypeScript checking remains blocked
by **48 unrelated diagnostics** in generated development route types and existing
accounting, DepositGuard and SpendLeak tests; no diagnostic names a task 2.5 file.
No production build, live database test or full-suite acceptance is claimed.

The [synthetic browser harness](../../tests/fixtures/commitguard-cash-context-browser.mjs)
bundles the actual form in memory with already-installed esbuild and serves only
fixture responses on loopback port 4179. It never starts Next, loads environment
credentials, authenticates, or calls a database/provider/mail API. Browser checks
on 2026-10-19 (clock pinned to that date) verified:

- `-0.29` drafts survive 409 and explicit reload; Save stays blocked until an
	explicit revision decision. Two PUTs were observed: rejected attempt and
	deliberate resave, not an automatic retry.
- Zero saves successfully. Failed post-save GET shows save-success warning;
	Retry load changes counts from PUT=1/GET=1 to PUT=1/GET=2.
- Expense update focuses its input, negative expenses produce an associated
	inline invalid state, and `0.29 USD` plus NZD tax attestation save independently.
	Clearing cash retains those expense/tax inputs.

This is component behavior evidence, not authenticated tenant/RLS acceptance,
live schema readiness, deployed CSS/mobile acceptance, or real server refresh
completion. Required target migration/ACL review (§5.2) and those broader checks
remain separate gates. No OpenSpec checkbox is changed by this task's implementation.

### 5.6 Coverage CRUD and reconciliation — UNMERGED / NOT DEPLOYED

Task 3.6 adds [coverage CRUD](../../app/api/commitguard/coverage/route.ts),
[real tenant services](../../lib/commitguard/coverageService.ts), and
[pure reconciliation](../../lib/commitguard/coverage.ts). This is not task 3.7's
summary v2, editor controls, CashPlan assembly, a deployed migration or a scheduler.
No OpenSpec checkbox is changed. No new environment variables or dependencies.

All four methods require a valid session, centralized subscription access and
`commitguard_core`. No query keys are accepted. GET returns `{coverage: [...]}`
including stale links and machine-readable `reviewReasons`. POST accepts strict
`commitmentId`, UTC `occurrenceDate` (`YYYY-MM-DD`), lowercase supported `currency`,
positive Int `coveredCents`, and `target: {kind, id}`; kind is `imported_bill` or
`tax_reserve_category`. PUT accepts those fields plus coverage `id`; DELETE accepts
only `id`. DTOs omit tenant identity, raw provider data and job internals.
Statuses: 201 create; 200 read/update/delete; 401 invalid session; 403 access;
400 input; 404 missing/foreign identity; 409 stale target/date/currency, duplicate
or cap conflict; safe 500 unexpected error; subscription verification may yield 503.

Writes share the existing `commitguard:<tenant>` advisory transaction lock with
cash/settings. Occurrence amounts and unpaid bills are row-locked, then validated
against the current projected occurrence and all tenant allocations, including
out-of-horizon bill links. Category SELECT/INSERT grants are not widened for a
row lock. Material create/update/delete, calculation revision, pending work and
before/after audit commit together. Identical valid PUTs have no durable effects.
Stale links remain explicitly removable; a second DELETE returns 404.

Bill totals are not unpaid balances. The adapter reads only existing numeric
Xero `AmountDue` or MYOB `BalanceDue` from persisted source metadata, bounded by
the imported total and live open/unpaid state. Missing/contradictory values are
unsupported, not inferred from an open status. Bill-covered tax portions require
an existing unambiguous, non-settled `TaxBufferObligation` bill/category relation.
Absent/conflicting attribution requires review, not supplier/amount matching.
No provider or payment API is called; no tax obligations are generated.

The pure category ledger leaves commitment total K intact and adds
`sum(max(0, requiredReserve - aggregateCovered))`. For R=12000/C=10000, K=10000
and additional reserve=2000, total=12000. For two covered occurrences totalling
12000 or 15000, total is respectively 12000 or 15000, not 24000 or 27000.
Uncovered commitments and unrelated reserves remain protected. Category coverage
may legitimately exceed R; only per-occurrence sums and unpaid-bill sums are
capped. Bill and direct-tax links consume disjoint portions of an occurrence.
Invalid/paid/disabled/deleted/settled/stale links contribute no overlap adjustment
and produce review quality, never a zero commitment residual. Unlinked tax-classified
occurrences require review when tax protection is active. Currencies stay partitioned.

`loadCommitGuardCoverageReconciliation(userId, windowStart, windowEnd, now)` is a
read-only integration point with half-open UTC windows, category/coverage lineage,
component totals and quality. The D2 adapter can run inside its tenant transaction.
It creates no defaults, events, snapshots or work. Callers must honor incomplete
quality; these component amounts are not an asserted consolidated free-cash result.
Task 3.7 now composes reconciliation in summary v2 (§5.7); actual forecast bill
deduction remains section 8 work. This does not add coverage editor controls.

Verification uses [pure tests](../../tests/commitguard-coverage.test.ts),
[real-service boundary tests](../../tests/commitguard-coverage-route.test.ts) and
the [isolated storage probe](../../scripts/verify-commitguard-coverage-storage.ts).
The probe guards the exact authorized socket/port/database/user, clones the
existing scratch database for committed concurrent fixtures, and drops the clone
in `finally`. It uses actual Prisma, `withUserContext`, RLS, locks and services;
only billing and the scratch connection factory are replaced. Two PostgreSQL
sessions cross a barrier before competing writes. Clone-only trigger failpoints
prove create/update/delete rollback on work/audit failure. Parent schema/ACLs,
trial/billing objects, roles and database inventory must match before/after.
Shared environment databases, service restarts and unrelated SQL remain prohibited.

Local verification evidence (2026-10-19; not deployment acceptance):

- `npm test`: **3376 passed**, no failures/skips; includes 11 new pure and 8 new
	real-service route tests.
- `node --experimental-test-module-mocks --import tsx --test tests/commitguard-coverage.test.ts tests/commitguard-coverage-route.test.ts tests/commitguard-protection-facts-loader.test.ts tests/commitguard-engine.test.ts tests/subscription-access-inventory.test.ts`:
	**62 passed** after the audit DTO type correction.
- `node --experimental-test-module-mocks --import tsx --test scripts/verify-commitguard-coverage-storage.ts`:
	**9 passed** (parent plus 8 cases). Actual concurrent backends exercise
	occurrence/duplicate/bill caps and the shared cash lock. Clone-only work/audit
	trigger failures roll back create/update/delete plus revision/work/events.
- `node --import tsx --test scripts/verify-rls-commitguard-constraints.ts scripts/verify-rls-commitguard-policies.ts`:
	**257 passed** across the existing constraint and RLS probes.
- Authorized source only: Unix socket `/tmp/paidsoon-commitguard-pg.i62Iri`,
	port `55437`, database `commitguard`, owner `syspac`; no shared environment URL.
	The disposable clone was removed and source schema/ACL/roles/database inventory
	matched its captured baseline. No production SQL or services were changed.
- Scoped ESLint passed. `npx tsc --noEmit --pretty false` still reports **48
	unrelated diagnostics** (22 generated development-route imports and 26 existing
	accounting/deposit/spendleak/trial test diagnostics); none are in task 3.6 files.
	This is not a clean repository-wide typecheck or full build claim.

### 5.7 Calculation and summary v2 reference — UNMERGED / NOT DEPLOYED

Task 3.8 documents existing local tasks 3.1–3.7, not merged/deployed capability.
No business logic, UI controls, scheduler, digest delivery or CashPlan assembler
is added by this documentation. Source contracts are the
[engine](../../lib/commitguard/engine.ts),
[summary](../../lib/commitguard/summary.ts),
[composition](../../lib/commitguard/protectionComposition.ts),
[tax facts](../../lib/commitguard/protectionFacts.ts) and
[coverage](../../lib/commitguard/coverage.ts).

#### Recurrence, confidence and horizon

**UTC boundaries:** use half-open `[today, today + days)` windows. A seven-day
window starting 2026-10-19 includes October 19–25; October 26 is excluded,
including when it equals the commitment end date. Start/end dates otherwise
include their dates when in-window. Only active/upcoming/ending/review unarchived
rows contribute; paused/cancelled/expired/archived rows do not.

**Calendar anchor:** preserve the original `nextDueDate` day through clamping.
A monthly January 31, 2028 anchor yields January 31, February 29, March 31.
An annual February 29, 2028 anchor yields February 28 in 2029–2031 and February
29 in 2032. `startDate` filters the schedule; it does not re-anchor it. A monthly
February 29 anchor yields March 29, not an inferred March 31. Weekly/fortnightly
historical dates are skipped mathematically, not spent against the emission
budget. A cap/overflow/invalid schedule reports incomplete quality rather than
a truncated total. Relevant legacy custom recurrence is unsupported, never
one-off; new custom writes return field-level 400 errors.

**Confidence:** confirmed, probable (high/medium), and potential (low) commitments
all count **in full**, not weighted by confidence. Show the three currency-specific
partitions; unconverted candidates are not obligations.

**Selected horizon:** saved `defaultHorizonDays` selects 7/30/60/90-day protection.
The separately labeled **Committed (Next 30 Days)** hero metric and percentage
buffer always use 30 days, not the selected horizon or a calendar month. This is
a calculation/presentation contract, not evidence all consumers are upgraded.

#### Buffer, full tax reserve and coverage

Fixed buffer uses its own currency; a legacy positive untagged buffer requires
review and a currency change must not relabel it. Explicit zero fixed buffer is
currency-neutral. Percentage buffer rounds compatible 30-day commitments ×
percent / 100 to cents. Weeks buffer rounds saved weeks × explicit weekly cents;
the complete basis needs its own same-currency nonfuture UTC date. Missing weeks
or basis is unavailable, not zero, including zero weeks with missing basis.
Cash and expense freshness are independent: age 0–7 inclusive is fresh; day 8 is
stale. Even a zero weekly basis needs compatible currency and a fresh date.

Gross cash includes reserved money. Use each enabled category's full required
reserve R, never reserved balance or reserve gap. Latest category overrides,
including zero, replace required amounts without enabling disabled categories.
Source and override dates remain lineage, not a new seven-day tax freshness rule.
No Tax Buffer entitlement or explicit disable yields zero/`not_applicable`;
entitled missing configuration, missing source data or ambiguous currency yields
unavailable protection. A configured zero category still needs its tax-currency
attestation. The existing AUD GST estimator is not relabeled as foreign tax.

Aggregate valid selected-horizon same-currency coverage C **per category**, then
keep full commitment total K and add `sum(max(0, R - C))`. Add safety buffer last.
This protects `max(R, C)` for each linked category plus uncovered commitments and
unrelated reserves; it is not a per-occurrence reserve subtraction. Bill and
direct-tax portions are disjoint; bill-covered tax needs explicit category
attribution. Aggregate occurrence and unpaid-bill caps still apply even when C
exceeds R. Never guess a link by supplier/amount/date. Invalid/paid/disabled/
deleted/settled/stale targets provide no overlap deduction and require review;
unlinked tax-classified commitments require review while tax protection applies.
Other categories are not silently reclassified as tax. Coverage editor UI and
actual forecast bill deduction remain separate tasks.

#### Currency, unavailable outputs and read-only retrieval

Keep source-currency totals; do not add AUD and USD cents or apply FX. Supported
cash codes are AUD/USD/NZD/GBP/EUR/CAD/SGD/HKD (lowercase storage). Unsupported
stored commitment currencies remain visible. Foreign selected-horizon occurrences
are explicit exclusions and block consolidated free cash; the compatible component
alone is not a safe spending amount. For percentage policy, foreign 30-day basis
occurrences also block consolidation even with a shorter selected horizon.
Legacy `horizons` is null unless exactly one supported completely projected group
exists; use `horizonsByCurrency`, not the first arbitrary group.

Primary quality precedence is disabled → missing → stale → unsupported_currency →
incomplete → complete; keep **all** reasons/actions. Currency mismatch also maps
to `unsupported_currency`. Missing settings remain disabled in memory, with no
default insert. Missing/stale/custom/currency/coverage/overflow problems produce
null `protectedCashCents`, null `freeCashCents` and null `status`, not WATCH or
zero. Independently valid components, saved cash and dates can remain visible.
For complete inputs only: free < 0 is shortfall; 0 through 25% of buffer is
at_risk; above 25% through buffer is watch; above buffer is safe. Zero free/zero
buffer is at_risk. Compute in bounded integer cents; never wrap overflow.

Both GET endpoints require session, subscription access and core entitlement.
Summary returns `{summary}` v2; CashPlan adapter returns v2 at the top level.
Inspect `asOf`, cash `inputRevision`, settings `calculationRevision`, selected
horizon, owner cash/date/freshness, grouped totals, protection/coverage lineage,
`sourceDates` and quality actions. Each call uses one tenant-scoped RepeatableRead
snapshot and injected/default clock, not a cross-request lock. GET writes no
settings/defaults, events, evaluation state, work or snapshots. In particular,
missing cash creates no WATCH assertion or cash-risk event.

**All query keys return 400**, including legacy `cashAvailableCents`,
`taxProtectedCashCents`, `weeklyOperatingExpensesCents`, currency/date/horizon
overrides, empty values and unknown keys. Stable response message:
"Query overrides are no longer supported. Save owner inputs with PUT /api/commitguard/cash-context."
Save financial inputs through §5.4, not query strings. The adapter exposes
91 half-open UTC days of full occurrence amounts/source revisions/coverage IDs;
it does not net bills, subtract reserves as movements, persist forecasts or prove
CashPlan consumption. These reads do not run/dispatch risk evaluation or promise
immediate mail. Local operational jobs, coherent UI refresh and existing-digest
integration are described in §1; their deployment and section-8 assembly remain pending.

#### Fixture-backed examples

All amounts below are **integer cents**, not whole dollars. Tax examples exclude
safety buffer and unrelated obligations unless explicitly listed.

| Existing regression fixture | Inputs | Expected result |
| --- | --- | --- |
| [Engine boundaries](../../tests/commitguard-engine.test.ts) | Three 100-cent one-offs on October 19, 25, 26; evaluation 2026-10-19; 7 days | Total 200; October 26 excluded |
| [Engine calendar anchors](../../tests/commitguard-engine.test.ts) | Monthly 2028-01-31; annual 2028-02-29 | Monthly Jan 31 → Feb 29 → Mar 31; annual Feb 28 in 2029–2031 → Feb 29 in 2032 |
| [Engine confidence groups](../../tests/commitguard-engine.test.ts) | Per currency: confirmed 100, high 200, medium 300, low 400 | Each currency total 1000 = confirmed 100 + probable 500 + potential 400; no AUD/USD sum |
| [Summary selected horizon](../../tests/commitguard-summary-v2.test.ts) | 2026-10-19; AUD cash 500000; due today 1000; day 45 (Dec 3) 4000; 60 days; buffer 10%; tax not applicable | Selected commitments 5000; 30-day hero/basis 1000; buffer 100; protected 5100; free 494900 |
| [Dated weeks composition](../../tests/commitguard-protection-composition.test.ts) | Evaluation Oct 19; 4 weeks × AUD 20000; basis Oct 12 | Buffer 80000; Oct 12 fresh, Oct 11 stale; missing basis unavailable, not zero |
| [Full required reserve](../../tests/commitguard-protection-facts.test.ts) | R=12000; reserved 5000; reserve shortfall 7000 | Required tax fact 12000, not 5000 or 7000 |
| [Category coverage](../../tests/commitguard-coverage.test.ts) | R=12000; K=C=10000 | Additional reserve 2000; combined 12000, not 22000 |
| [Aggregated category coverage](../../tests/commitguard-coverage.test.ts) | R=12000; two covered 6000 occurrences, then two covered 7500 occurrences | C=12000 → 12000 protected; C=15000 → 15000 protected, not 27000 |
| [Partial and unrelated protection](../../tests/commitguard-coverage.test.ts) | K=20000; C=10000 against R=12000; unrelated reserve 3000 | Combined 25000: 20000 + 2000 + 3000 |
| [Summary unavailable and GET boundaries](../../tests/commitguard-summary-v2.test.ts) | Missing/day-8 cash, custom recurrence, currency exclusions; GET overrides | Null consolidated protection/free/status; no durable writes; overrides 400 |

The existing executable fixtures directly cover these examples, so no duplicate
doctest or new dependency is needed. Offline mocked read tests prove the tested
service boundary only, not live RLS, authenticated end-to-end behavior, scheduled
evaluation or deployed consumer consistency. Migration/ACL review (§5.2) and
later acceptance/rollout tasks remain mandatory.

Task 3.8 verification (2026-10-19): the six fixture files linked above, plus
[custom-recurrence write tests](../../tests/commitguard-custom-recurrence.test.ts)
and [recurrence-consumer tests](../../tests/commitguard-recurrence-consumers.test.ts),
passed **151/151**, with no failures/skips. They ran with Node's experimental
module mocks, the `tsx` loader and synthetic test-only environment values; no
live database, provider API or email was used. Strict OpenSpec validation and
scoped whitespace checks passed; local documentation file links resolve,
including the new calculation-section anchors. The user guide has no editor
diagnostics; the runbook retains existing hard-tab/link warnings and DDD retains
existing table-style/duplicate-heading warnings. No clean Markdown-lint,
full-suite/build/typecheck, live rollout or
broader acceptance is claimed. Only the three documentation files were edited;
business code, fixtures and task checkboxes remain unchanged by this task.