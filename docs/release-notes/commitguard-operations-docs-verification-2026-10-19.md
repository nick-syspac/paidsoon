# CommitGuard task 6.8 operations documentation verification — 2026-10-19

**UNMERGED / NOT DEPLOYED.** Documentation only, task 6.8 only. All task
checkboxes remain unchanged, including 6.7, 6.8 and 7.7. Existing implementation
and other working-tree changes were preserved. No runtime/test code was changed.

## Documentation and verified sources

- [CommitGuard operations](../runbooks/commitguard.md#task-68-operator-procedures--unmerged--not-deployed):
  existing-secret authentication, one scheduler owner/gate OFF, bounded scans,
  counts/ages/attempts/safe-code diagnosis, exact repair/retry routes, history
  versus delivery and ordered storage authorization boundary.
- [Railway runbook](../runbooks/railway.md#candidate-selection-is-not-execution-authorization--trial-access-rollout),
  [worker README](../../worker/README.md#commitguard-extension--unmerged--not-deployed-release-gate-off)
  and [DDD](../DDD.md#4111-cash-protection-calculation-contract--unmerged--not-deployed)
  agree on existing auth, gate OFF and current completed/200 evaluation.
  The existing [central environment matrix](../runbooks/README.md#railway-environment-variable-matrix)
  remains unchanged; no new variable or secret is introduced.
- [Task 6.3](commitguard-queue-verification-2026-10-19.md),
  [task 6.4](commitguard-source-repair-verification-2026-10-19.md) and
  [task 6.5](commitguard-operational-evaluation-verification-2026-10-19.md)
  verification records retain their original stage-specific evidence with explicit
  historical labels. Their earlier deferral/dependency/task-status snapshots do
  not override the current [task 6.6 composition](../../lib/commitguard/jobDispatch.ts).

The source review covered [internal auth](../../lib/commitguard/internalJobAuth.ts),
[execution route](../../app/api/internal/jobs/commitguard/route.ts),
[dispatch route](../../app/api/internal/jobs/commitguard/dispatch/route.ts),
[claim](../../lib/commitguard/jobClaim.ts),
[fenced side effects](../../lib/commitguard/workSideEffects.ts),
[scan](../../lib/commitguard/workScan.ts),
[repair](../../lib/commitguard/sourceRepair.ts),
[lifecycle/retry](../../lib/commitguard/workLifecycle.ts),
[admin retry route](../../app/api/admin/tenants/%5Bid%5D/commitguard/retry/route.ts),
[operational evaluation](../../lib/commitguard/operationalEvaluation.ts),
[risk evaluation](../../lib/commitguard/riskEvaluation.ts),
[history service](../../lib/commitguard/alertHistory.ts),
[history route](../../app/api/commitguard/alerts/route.ts),
[history UI](../../components/dashboard/commitguard/CommitGuardAlertHistory.tsx),
[worker extension](../../worker/paidsoon_worker/commitguard.py),
[Beat registration](../../worker/paidsoon_worker/celery_app.py),
[release gate](../../worker/paidsoon_worker/config.py) and
[HTTP client](../../worker/paidsoon_worker/api_client.py).

The worker's retained mocked `deferred` passthrough test demonstrates no broker
autoretry for that response; it does **not** establish that the current Next.js
handler emits 202. Current handler/evaluator tests establish completed/200.
The code-disabled dispatcher does not disable direct authenticated HTTP calls;
manual repair/retry is an authorized write, not a read-only diagnostic.

## Fresh offline verification

| Check | Result |
| --- | --- |
| Focused Node command below, with repository test-script synthetic environment | **113 passed**, 0 failed/skipped/cancelled |
| Complete worker suite, existing worker venv Python 3.14.6, `-m unittest discover -s tests` from worker directory with synthetic environment | **27 passed** |
| Read-only Node link/anchor check over all eight edited documents | **211 local paths and Markdown heading anchors resolve** |
| Read-only Node contract assertions | Diagnostic SQL contains only safe aggregate metadata; default dispatch has both evaluators/no pending-pipeline response; gate OFF; 6.7/6.8/7.7 remain unchecked |
| `openspec validate fix-commitguard-cash-protection-workflows --type change --strict` | Passed |
| `git diff --check` | Passed |

Editor checks found no issues in the CommitGuard/Railway runbooks or four
verification records. Existing table-formatting and duplicate-heading diagnostics
remain in DDD and the worker README; no unrelated formatting cleanup was made.

Focused Node invocation (use only synthetic environment configuration, as in
the [package test script](../../package.json), never production credentials):

```text
node --experimental-test-module-mocks --import tsx --test tests/commitguard-internal-job-route.test.ts tests/commitguard-work-side-effects.test.ts tests/commitguard-work-lifecycle.test.ts tests/commitguard-work-scan.test.ts tests/commitguard-source-repair.test.ts tests/commitguard-operational-evaluation.test.ts tests/commitguard-alert-history.test.ts tests/commitguard-page.test.ts
```

These tests execute actual route/services/evaluators/renderers with mocked
storage/auth boundaries. Coverage includes secret rejection before DB access,
current-access rechecks, lease/fence/revision rollback, retry generations,
bounded repair/scan recovery, gate OFF and tenant-scoped paginated history.
Worker tests mock/forbid network, database and broker calls. The diagnostic SQL
example is an aggregate over work metadata only: kind/state/attempts/safe code,
counts and ages; it does not select amounts, suppliers, recipients, financial
text, raw payloads, lease owners/fences or credentials. It was inspected, **not
executed**. Examples contain no secret values or real tenant/work identifiers.

## Remaining boundaries

No full Node suite, lint, TypeScript check, production build, live PostgreSQL/RLS
probe, authenticated browser acceptance, API/provider/email call, SQL application,
shared-target inspection, deployment, scheduler activation or real retry was
performed for this documentation-only pass. Earlier recorded results remain
historical and are not presented as fresh verification.

The [ordered storage gate](../runbooks/commitguard.md#52-ordered-review-gate--not-authorization-to-deploy)
still requires target-ledger/predecessor review, then authorized CommitGuard
migration → entire supplemental CHECK transaction once → targeted policies in
one owner transaction, protecting the intervening access gap and preserving
unrelated trial/billing ACLs. No blanket migration or canonical-policy application
is authorized. Repository migration order and the CHECK/policy artifact headers
were read to confirm this sequence; no actual target ledger was inspected.
Activation needs separate review and exactly one scheduler owner.
Task 7.7 relevant-event digest integration remains pending; history and daily
evaluation success do not prove immediate or exactly-once email delivery.