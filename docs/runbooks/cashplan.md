# CashPlan Operations Runbook

**D9 bounded integration: LOCAL / UNMERGED / NOT DEPLOYED.** This describes the
current working tree and offline regressions, not production coverage, completed
rollout acceptance, or scheduler activation. Task checkboxes remain unchanged.

CashPlan is a planning estimate, not an accounting ledger or verified bank balance.
The canonical summary/items/settings, settings review page, overview cash posture,
and CashPlan Owner's Digest provider share one read-only assembler. Other CashPlan
calendar/explanation/data-quality/periods/export and scenario paths have not been
migrated by this bounded change; they are not evidence of the same source coverage.

## 1. Operational flows

### 1.1 Forecast generation and summary

Primary paths:

- `lib/cashplan/engine.ts`
- `lib/cashplan/service.ts`
- `lib/cashplan/inputLoader.ts`
- `lib/cashplan/factLoader.ts`
- `lib/cashplan/factAssembler.ts`
- `GET /api/cashplan/summary`
- `POST /api/cashplan/summary`
- `GET /api/cashplan/items`
- `GET /api/cashplan/settings`

Operational notes:

- Select an explicitly requested tenant-owned `planId`, otherwise the latest
	existing plan by created date then ID. Missing/foreign requested plans return
	404; GET never creates a plan. Settings precedence is selected-plan settings,
	tenant-global settings, then plan configuration.
- Only 13 weeks are supported. Week zero starts on the evaluation date at midnight
	in the selected timezone. UTC obligation dates convert to that local calendar
	for indexing, including DST. Other horizons/timezones are unavailable, not truncated.
- Opening cash is saved **gross owner-entered cash**, including reserved cash,
	with currency, balance date and revision. Never use CommitGuard free cash or a
	legacy snapshot balance. There is no automatic provider/bank-balance ingestion,
	intervening-movement reconciliation, or FX.
- Cash is usable through UTC day 7 and stale on day 8. A still-fresh balance before
	the local anchor carries `unreconciled_balance_age`; it is a dated estimate.
	Missing/stale/incompatible cash produces null summary money, no displayed weeks
	or misleading digest cash-risk signal, and no fabricated zero-money snapshot.
- All bounded forecasts remain preliminary: receivables are missing and payable
	coverage is partial. Commitment-only forecasts also carry `commitments_only`.

### 1.1.1 Exact included source boundary

1. Active/upcoming/ending/review, non-archived compatible CommitGuard occurrences
	 from supported recurrence; paused/cancelled/expired rows do not contribute.
	 Stable identity is `commitguard:<commitmentId>:<UTC date>`, with revision,
	 currency and explicit coverage references. Foreign currencies are excluded
	 with quality reasons, never summed or converted.
2. **Only explicitly covered unpaid imported bills**, in-window and in the same
	 currency, with an owned connection and supported explicit remaining balance.
	 The current adapter accepts numeric persisted Xero `AmountDue` and MYOB
	 `BalanceDue`, in major units, for open/unpaid bills. It does not call either
	 provider. Bill total is not an unpaid-balance fallback. QuickBooks/other
	 providers or missing/unsupported balance fields do not imply coverage.
3. Version-2 canonical snapshot facts **only after reconstruction from current
	 occurrence, linked-bill or dated-manual sources**. Validate plan/scenario,
	 currency, local anchor/timezone/horizon, cash/commitment/settings revisions,
	 source identity/hash/date, coverage and input hash. This is lineage validation,
	 not ingestion of arbitrary persisted facts or reuse of opaque weekly totals.
4. Existing valid overrides of those exact targets, using latest updated date/ID
	 precedence within their effective interval. Standalone manual inflows/outflows
	 require persisted `plannedDate` in the window. Legacy untimed rows stay visible
	 as `timing_review`, without guessing a date from IDs or creation time;
	 unsupported non-manual untargeted overrides are not added as movements.

Coverage applies **after** overrides, only when both amounts are actually included.
A 6000-cent included bill covering a 10000-cent occurrence leaves 4000 cents of
commitment outflow. Paid, absent, excluded, incompatible, unsupported-balance or
out-of-window bills leave the full commitment residual and `coverage_review`.
An unlinked bill is not a forecast source. No supplier/amount similarity matching,
broad receivable/payment/bank ingestion, DepositGuard reserve movement or complete
provider coverage is claimed. Tax reserves and safety buffers protect cash in
CommitGuard; they are **not additional CashPlan cash movements**. A tax-classified
commitment is still an occurrence, not a second reserve deduction.

### 1.1.2 Snapshot refresh and retained history

- GETs, the review page, overview and CashPlan digest provider compute/read without
	CashPlan defaults, event/work or snapshot writes. They do not HTTP-call the
	CommitGuard adapter or the writing Tax Buffer summary.
- **Only explicit `POST /api/cashplan/summary` or the trusted fenced evaluation
	job** appends a new base-plan version-2 snapshot. POST accepts optional owned
	`planId`; unavailable inputs return a null snapshot ID, not invented cash.
- Snapshot metadata includes anchor/currency, cash and commitment revisions,
	canonical source facts/settings fingerprint, coverage, quality and input hash.
	Current sources must still reconstruct before a snapshot can be reused.
- Legacy and superseded v2 snapshots remain unchanged historical records. They
	are never merged, rewritten, deleted or stacked onto current occurrences.
	Relevant source/revision changes invalidate reuse without requiring a GET write.
- CashPlan retains subscription-only admission, including Essentials core
	contribution under current effective access; no extra CashPlan feature gate is
	introduced. Disabling CommitGuard suppresses occurrence/linked-bill contribution
	and reads, but retains saved cash, commitments, coverage and historical snapshots.
	Dated standalone manual items remain independent. Revoked subscription access
	blocks financial reads; stored snapshots are not access authority.

### 1.2 Settings and operator review surface

#### D9 storage dependency — local source only, 2026-10-20

The [CashPlan-only policy artifact](../../prisma/rls-cashplan-commitguard-policies.sql)
matches its marked block in [canonical RLS](../../prisma/rls-policies.sql).
After separately reviewing the actual target's migration order, the proposed
order is additive CommitGuard migration → supplemental CHECKs → CommitGuard
policies → CashPlan-only policies in an owner transaction. **Do not execute this
on shared development/preview/production without separate authorization.** Do
not apply full canonical or trial/billing SQL to resolve this dependency.

Plans receive authenticated SELECT only. Snapshots and overrides authorize via
their actual plan relation, never descriptive owner/creator fields. Snapshots
allow SELECT and explicit-column INSERT with null scenario only; overrides
retain the existing manual-item INSERT columns plus SELECT. No client UPDATE,
DELETE, plan creation or owner/plan reassignment is granted. Prisma sends
creation timestamps on INSERT, so those columns are explicitly included.
Both table and column client grants are reset only on the three target tables.

The artifact replaces its five known policy names, including older FOR ALL
definitions. Unknown client SELECT/INSERT/ALL policies abort application for
review rather than silently OR around ownership or being deleted wholesale.
Other-operation policies are preserved but no client write grant activates them.
Review any abort privately against the target catalog; never remove unrelated
policies or grant broad privileges to make verification pass.

The [current-runtime isolated verifier](../../scripts/verify-commitguard-current-runtime-storage.ts)
applies the actual artifact twice, checks canonical equality and policy/ACL
equivalence, preserves unrelated catalog state, and runs 53 raw role/identity
probes plus actual refresh/fenced snapshot publication. It uses no diagnostic
grants. Only the authorized socket/template and disposable clones are used;
source catalog/data and pre-existing database inventory match after cleanup.
Shared RLS, scheduled execution and delivery acceptance remain pending.

Primary user-facing surface:

- `/dashboard/settings/cash-plan`

Primary routes:

- `GET/PUT /api/cashplan/settings`
- `POST /api/cashplan/items` (explicit dated manual item)

The page remains read-only review; it does not add a refresh button, manual-item
form or settings editor. API support is not evidence of those UI controls.

### 1.3 Export and related integrations

Export endpoint:

- `GET /api/cashplan/export`

Export and ancillary views are outside the canonical consumer rollout above.
The external `GET /api/commitguard/cashplan` adapter remains available but is not
the internal CashPlan source. No Tax Buffer or DepositGuard reserve feed is added.

## 2. Environment variables

CashPlan introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- Existing auth and database variables.
- Existing persisted accounting data for explicitly linked bills only; this
	assembler does not contact accounting providers or fetch balances.
- No dedicated cron, webhook, or module-only worker secret is required for the current shipped scope.

## 3. Operational boundaries

- CashPlan should remain described as a planning tool, not as a source-of-truth accounting ledger.
- Forecast confidence and data-quality warnings are part of the product behavior and should not be treated as incidental UI noise.
- Related cash plan views are implemented, but the canonical documented operator entry point is `/dashboard/settings/cash-plan`.

## 4. Troubleshooting

### 4.1 Forecast stays preliminary or low-confidence

Likely causes:

- Missing opening cash or source balances.
- Stale or low-confidence upstream inflow/outflow inputs.
- Buffer targets or settings exist, but core source inputs are incomplete.

Actions:

1. Inspect `quality`, `sourceCoverage` and dated `startingBalance` on the canonical
	summary; do not substitute the ancillary data-quality endpoint for this contract.
2. Review saved cash, supported plan configuration, explicit bill balances/coverage
	and any untimed manual items. Provider connectivity alone does not imply coverage.
3. Re-read summary/items/settings after a supported mutation. Refresh persistence
	only by explicit POST or the authorized job; never by visiting a page.

### 4.2 CashPlan output disagrees with CommitGuard or Tax Buffer

Likely causes:

- The outputs measure different things: CommitGuard free cash subtracts protection;
	CashPlan projects gross cash movements over 13 local-calendar weeks.
- Source revisions, evaluation clocks, currency, coverage or cash dates differ.

Actions:

1. Compare summary/items/settings, overview and CashPlan digest provider at the
	same clock/input revision. They must agree on projected lowest cash.
2. Inspect exact occurrence/bill/override lineage, not aggregate adapter totals.
3. Never resolve a mismatch by using free cash as opening cash, subtracting tax
	reserves as movements or applying FX. Retain invalidated snapshots as history.

### 4.3 Related cash plan views load but export or explanation looks incomplete

Likely causes:

- The forecast has insufficient detail for some derived explanations.
- The current period or filter selection has little or no data.

Actions:

1. Distinguish canonical items/summary from ancillary historical/fallback views.
2. Do not treat seeded/scenario weeks as reconstructable active source facts.
3. Do not widen ingestion/export or edit historical snapshots to conceal a gap.

## 5. Offline regression evidence

[Canonical consumer integration fixtures](../../tests/cashplan-canonical-consumers.test.ts)
call the actual routes and shared services with synthetic rows, a fixed clock,
mocked auth/access/persistence and a fail-closed read-only transaction. They cover
commitments-only estimates, nonzero tax protection versus movements, validated
source reuse/rejection, gross cash, disabled behavior, current-access fallback,
no FX and retained legacy/v2 history. The overview page wiring assertion is static;
the formatter/settings page and digest provider are executed. These are not live
Next.js/RLS/provider/scheduler/delivery acceptance. No external DB/API/email is used.