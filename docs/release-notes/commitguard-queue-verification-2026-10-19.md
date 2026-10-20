# CommitGuard task 6.3 verification — 19 October 2026

**UNMERGED / NOT DEPLOYED.** Task checkboxes are intentionally unchanged.
This record covers local source and mocked tests, not scheduler activation,
PostgreSQL execution/ACL proof, browser acceptance or delivered alerts.

> **Historical task 6.3 snapshot.** The dependency-deferral descriptions and test
> results below record that stage, not the current handler contract. Task 6.6 now
> composes both evaluators and returns completed/200 under the final fence. See
> [task 6.6 evidence](commitguard-risk-evaluation-verification-2026-10-19.md) and
> [current operator procedures](../runbooks/commitguard.md#task-68-operator-procedures--unmerged--not-deployed).
> Retaining this record does not reassert 202 deferral or authorize activation.

## Scope and paths

- [Bounded discovery](../../lib/commitguard/workScan.ts): independently bounded
  100-tenant daily keyset, 100 expired-work recovery, 100 due-pending scans;
  eligible enabled tenant / UTC-date dedup, source-independent pending recovery.
- [Lifecycle](../../lib/commitguard/workLifecycle.ts): six-attempt exponential
  failure/crash retry, safe exhaustion, owner/fence/expiry-conditional defer
  release, trusted elevated retry generation with retained private history.
- [Claim](../../lib/commitguard/jobClaim.ts),
  [dispatch](../../lib/commitguard/jobDispatch.ts), and
  [atomic boundary](../../lib/commitguard/workSideEffects.ts): current access,
  canonical daily/source validation, superseded evaluations, current-settings
  detection, private non-resurrecting 60-second lease renewal and final fence.
- [Internal scan route](../../app/api/internal/jobs/commitguard/dispatch/route.ts)
  reuses existing secret; [retry action](../../app/api/admin/tenants/%5Bid%5D/commitguard/retry/route.ts)
  requires elevated platform-admin/owner, not a worker bearer credential.
- [Actual Railway workflow](../../worker/paidsoon_worker/commitguard.py),
  [existing Beat owner](../../worker/paidsoon_worker/celery_app.py),
  [code release gate](../../worker/paidsoon_worker/config.py): five-minute
  extension remains OFF. No broker-owned CommitGuard lifecycle/retry counter,
  new scheduler, cron, infrastructure, environment variable or package.
- [Canonical policies](../../prisma/rls-policies.sql) and
  [targeted policies](../../prisma/rls-commitguard-policies.sql) reserve daily
  request identity for the executor; no lifecycle grant is widened. Existing
  task-1 schema already contains generation/history/lease fields, so 6.3 adds
  no schema migration. No policy or other SQL was applied to any database.

## Dependency, not false completion

The existing evaluator is still an explicit scaffold until tasks **6.5/6.6**.
Its HTTP 202 `evaluation_pipeline_pending` is not an event pipeline, completion,
successful daily evaluation or failed execution. A valid lease is released back
to pending, that claim attempt is refunded and discovery is delayed five minutes.
It cannot hot-loop or six-fail solely for explicit dependency deferral. Crashes
and ambiguous timeouts still count normally. Daily-success state is staged only
after a real trusted evaluator returns and passes the final atomic fence.

No task 6.4 completed-source repair scanning is included. No new email sender or
immediate-delivery guarantee is introduced. Release gating, reviewed database
application and single-owner scheduler activation require separate authorization.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | **3,719 passed**, 311 suites; 0 failed/skipped/cancelled |
| Complete worker suite: selected worker venv interpreter, `-m unittest discover -s tests`, worker directory, synthetic canonical env | **25 passed** |
| `npm run lint` | **0 errors**, 1 existing unused-argument warning in [navigation](../../lib/settings/navigation.ts#L76) |
| `npx tsc --noEmit --incremental false` | Exit 2: **48 unrelated diagnostics** (22 generated Next dev route types, 26 existing accounting-trigger/DepositGuard/SpendLeak/trial-access test diagnostics); no task 6.3 file diagnostic |
| `git diff --check` | Passed |
| `openspec validate fix-commitguard-cash-protection-workflows --type change --strict` | Passed; checkboxes unchanged |
| Editor errors on changed worker modules/tests and new TS routes/tests | None; Pylance `textDocument/diagnostic` on workflow module also returned an empty list |

The Node command uses the repository's synthetic database environment and module
mocks. The new Python tests explicitly forbid `httpx.post`, `psycopg.connect`
and Celery `send_task`; actual helpers/task bodies run with mocked boundaries.
No external DB, Redis, provider API or email transport is used by these tests.
No new dependency was installed; the existing worker venv (Python 3.14.6),
Celery, httpx, psycopg and Node test tooling are reused.

### Regression coverage

- [Actual route/dispatch](../../tests/commitguard-internal-job-route.test.ts):
  mismatched identities, current access/revocation/expiry, canonical completed
  sources, UTC daily identities, out-of-order revisions, independent ingestion,
  explicit defer, daily success only through a real trusted evaluator, and safe
  responses/logs with no financial values/lease metadata.
- [Actual boundary](../../tests/commitguard-work-side-effects.test.ts):
  shared lock order, authenticated financial queries, role-restoration rollback,
  owner/fence/revision/access/expiry invalidation and non-resurrecting renewal.
- [Actual lifecycle/retry route](../../tests/commitguard-work-lifecycle.test.ts):
  six attempts/backoff, exhausted recovery, stale fences/owners, exact lease
  expiry, defer refund/delay, failed-generation compare-and-reset, current admin
  session/role SQL assertion, retained multi-generation history, safe retry DTO,
  and matching targeted/canonical policy privacy/namespace source assertions.
- [Actual scanner/internal route](../../tests/commitguard-work-scan.test.ts):
  bounded metadata-only scans, denied-tenant pagination, daily dedup independent
  of revision, module disable, lost enqueue rediscovery, expired recovery and
  identity-only queue DTO, secret validation before queries.
- [Actual worker extension](../../worker/tests/test_commitguard.py): gate OFF,
  no schedule registered, no DB/API/broker calls, enqueue loss preserves
  rediscovery/other jobs, keyset progress, explicit defer without autoretry,
  and out-of-order identity-only delegation without cached permissions.

### Remaining environment-dependent evidence

No live database/policy/concurrent PostgreSQL test or production build was run
for this task. The SQL policy assertions are source tests, not PostgreSQL ACL
proof. Existing isolated storage probes and reviewed rollout gates remain
required before enabling dispatch. No scheduler/deployment/manual verification
is inferred from passing mocked tests. No task checkbox was changed.