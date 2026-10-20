# CommitGuard task 6.4 verification — 19 October 2026

**UNMERGED / NOT DEPLOYED.** Scope is task 6.4 only. Tasks 6.2/6.3 remain
unchecked pending main final verification. No task 6.5 events, evaluator
completion, scheduler activation, shared/scratch database operation, migration,
ACL change, package or environment variable is included.

> **Historical task 6.4 snapshot.** Checkbox/dependency statements below describe
> that stage only, not the current ledger or evaluator. Tasks 6.5/6.6 now run the
> combined evaluator; see [task 6.6 evidence](commitguard-risk-evaluation-verification-2026-10-19.md)
> and [current operations](../runbooks/commitguard.md#task-68-operator-procedures--unmerged--not-deployed).
> Original test results are retained without implying deployment or activation.

## Paths and contract

- [Source repair](../../lib/commitguard/sourceRepair.ts): independent 100-row
  accounting/import keyset pages, database UTC daily pass, metadata-only system
  discovery exception and tenant-RLS ownership/completion revalidation.
- [Original completion helper](../../lib/commitguard/detectionRequest.ts): reused
  unchanged behavior; exact task-5.4 eligibility, canonical dedupe identity,
  minimal parameterized INSERT/defaults, targetless conflict no-op.
- [Existing scanner](../../lib/commitguard/workScan.ts): validated `repairState`
  request/response hint, repair before pending discovery; no new route.
- [Existing Railway extension](../../worker/paidsoon_worker/commitguard.py): carries
  independent source cursors/daily completion hints across five-minute ticks.
  Existing code gate remains false; no Beat schedule is activated.
- [Runbook](../runbooks/commitguard.md): task-specific boundary, daily continuation,
  failed-source progress, replay and exhausted-generation behavior.

The canonical missing-work check is tenant/kind/dedupe-key based and ignores
work state/generation/source columns. It never recreates exhausted work, and a
noncanonical source spoof cannot suppress a real source. Per-source transaction
failures advance the keyset and are revisited next day. Page-state loss on
restart replays safely; it is not durable authority or a permission snapshot.
Repair creates requests only. Actual execution retains current access/module/
opt-in checks and the existing atomic lease/fence boundary.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **3,728 passed**, 311 suites; 0 failed/skipped/cancelled |
| Complete worker suite, existing configured venv Python 3.14.6, `-m unittest discover -s tests` from worker directory with synthetic canonical env | **27 passed** |
| Focused repair/scan/accounting/spreadsheet Node files | **40 passed** |
| Focused worker CommitGuard tests | **8 passed** |
| `npm run lint` | **0 errors**, 1 existing unused-argument warning in [navigation](../../lib/settings/navigation.ts#L76) |
| `npx tsc --noEmit --incremental false` | Exit 2, **48 unchanged unrelated diagnostics**: 22 generated Next dev route types, 26 existing accounting-trigger/DepositGuard/SpendLeak/trial-access tests; none in task 6.4 files |
| Editor diagnostics on implementation/tests; Pylance diagnostic on worker module | None |
| `git diff --check` and strict OpenSpec change validation | Passed; only task 6.4 checked, progress 30/54 |

[Actual repair/helper/route tests](../../tests/commitguard-source-repair.test.ts)
cover crash-after-commit recovery, concurrent/restarted replay, both source
streams, exact failed/partial/incomplete/skipped-row suppression, all canonical
work states/generations, forged source columns/noncanonical keys, cross-tenant
dedupe, ownership/completion changes between discovery and insert, concurrent
exhausted insertion, and 201 rows per stream with the first 100 failing. They
also verify independent bounded progress, safe diagnostics, completed-day query
suppression, UTC rollover/late completion, malformed/unauthenticated requests,
and actual scanner rediscovery after lost enqueue.

[Actual worker tests](../../worker/tests/test_commitguard.py) cover pagination
hint transport, retained completed-day state, failed-scan cursor preservation,
restart replay, enqueue failure and the unchanged disabled release gate.
[Existing scanner tests](../../tests/commitguard-work-scan.test.ts) retain the
separate daily/recovery/pending contract and assert repair precedes discovery.

All new Node tests mock database boundaries; the actual insertion helper runs
against those mocks. Worker tests prohibit network, psycopg and Celery broker
access. No DB/API/Redis/email transport is needed or used by this verification.
Mocked SQL-shape tests are not PostgreSQL execution/ACL/concurrency proof.
No isolated database test or production build was run for task 6.4. Existing
storage/rollout checks and separate scheduler authorization remain prerequisites.