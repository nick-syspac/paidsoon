# CommitGuard task 6.5 verification — 2026-10-19

**UNMERGED / NOT DEPLOYED.** Scope is task 6.5 only. No task checkboxes changed.
Task 6.4 changes already present in the working tree were not rewritten.

> **Historical task 6.5 snapshot.** References below to default deferral and
> pending risk/history work describe that verification stage only. Task 6.6 now
> completes the combined evaluator pipeline with 200; local task 6.7 history paths
> also exist. See [task 6.6 evidence](commitguard-risk-evaluation-verification-2026-10-19.md)
> and [current operations](../runbooks/commitguard.md#task-68-operator-procedures--unmerged--not-deployed).
> Original results remain historical evidence, not deployment proof.

## Code boundary

- [Operational evaluator](../../lib/commitguard/operationalEvaluation.ts): real
  occurrence projection, stable renewal/notice threshold keys, immutable missed
  deadlines, preference/access gating and event relevance persistence.
- [Dispatch](../../lib/commitguard/jobDispatch.ts): invokes the evaluator inside
  the existing fenced tenant transaction before optional trusted risk composition.
  Until task 6.6, default dispatch remains deferred/pending and never advances
  successful daily evaluation or writes risk state.
- [Fence boundary](../../lib/commitguard/workSideEffects.ts): a narrow staged
  advanced-access requirement rechecks alert entitlement before commit, including
  a mid-computation downgrade that retains core module access.
- [Engine](../../lib/commitguard/engine.ts): renewal severity now respects positive
  unique thresholds, including one/two-threshold lists and every outer watch band.

## Offline coverage

- [Evaluator/engine tests](../../tests/commitguard-operational-evaluation.test.ts):
  exact UTC today/day-7/day-8 boundaries, overdue exclusions, old weekly and
  month-end/leap-year anchors, start/end dates, unsupported schedules, inactive
  statuses, preferences, one/two/multiple thresholds, delayed first observations,
  skipped bands, deadline day, missed-deadline catch-up and changed cycles.
- [Actual internal route tests](../../tests/commitguard-internal-job-route.test.ts):
  real evaluator/engine plus mocked transaction storage; replay, competing dispatch
  claims, persisted threshold crossings, relevance/cycle changes, lifecycle/access
  suppression, and rollback of new events AND old relevance after lease expiry,
  changed fence/owner/revision, revoked access or lost advanced-alert entitlement.
  Queue serialization is mocked;
  this does not establish live PostgreSQL concurrency or RLS evidence.
- Existing task 6.1 boundary tests verify lock ordering, role restoration and
  atomic rollback. Existing summary tests retain read-only GET coverage.

## Validation

- Full offline Node suite (`npm run test`): **3748 passed, 0 failed**.
- Repository lint (`npm run lint`): **0 errors**, one existing unused `isVisible`
  warning in [settings navigation](../../lib/settings/navigation.ts).
- TypeScript: 48 existing diagnostics outside changed files; no diagnostics in
  the evaluator, dispatch, fence boundary, engine or changed test files
  (`npx tsc --noEmit --pretty false`; generated Next types and unrelated fixtures
  still prevent a clean project-wide result).
- Strict OpenSpec change validation and `git diff --check`: passed.
- No database, provider API, email, migration, worker deployment or scheduler
  activation was used. No dependency, schema, ACL, secret or checkbox changes.

## Interpretation and remaining boundary

D8 resolves the due window explicitly: eight UTC dates, unlike a seven-date
financial horizon. Renewal thresholds use the decision deadline (renewal minus
notice), including day zero; a negative day is one missed notice event. The
existing independent renewal/notice category switches control their respective
events. No additional product requirement was invented or spec artifact changed.
Risk episodes/material changes (6.6), history presentation (6.7), digest rollout
and deployment acceptance remain outside this task.