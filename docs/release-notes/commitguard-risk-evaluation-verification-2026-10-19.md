# CommitGuard task 6.6 verification — 2026-10-19

**UNMERGED / NOT DEPLOYED.** Task 6.6 only; no task checkboxes changed.
Existing working-tree changes for other tasks were retained. No task 6.7 UI,
section 7 digest integration, schema, ACL, worker or scheduler changes.

## Code and approved policy

- [Risk evaluator](../../lib/commitguard/riskEvaluation.ts) uses the real saved-input
  version-2 summary inside the existing tenant/work fence. Missing, stale,
  incomplete or incompatible inputs never produce a cash-risk status or alert.
  A prior actionable episode is suspended, not resolved. Complete SAFE resolves;
  later risk creates a deterministic new episode. Unavailable data after SAFE
  preserves the already-resolved episode and its resolution date.
- Unchanged risk reuses its event and refreshes monetary/revision context.
  Severity crossings create distinct events within the episode; repeated severity
  crossings do not rewrite earlier history. Current category preferences and
  advanced-alert access suppress publication. Access is checked again at commit.
- [D8](../../openspec/changes/fix-commitguard-cash-protection-workflows/design.md)
  explicitly approves **5,000 cents OR 15%** materiality. Amount events use the
  existing changed-field audit, its input revision, currency and stable audit ID.
  Decreases are informational. The existing increase severity rule is retained:
  at least 35% is warning; other material increases are watch. Currency changes
  are not treated as comparable monetary deltas. Legacy amount history remains
  intact and matching prior publications are not duplicated.
- [Mutation service](../../lib/commitguard/service.ts) records the revisioned
  changed-field audit and durable evaluation request atomically; it no longer
  publishes amount alerts on the user mutation path. Basic audit survives
  preference/access suppression. Suppressed changes are not replayed as fresh
  alerts when preferences/access are later restored.
- [Dispatch](../../lib/commitguard/jobDispatch.ts) runs task 6.5 operational
  evaluation plus task 6.6 risk/amount evaluation on the **same transaction**.
  [The existing fence](../../lib/commitguard/workSideEffects.ts) persists staged
  evaluation state and completes work only after final access/revision/lease/
  owner/fence validation. Matching calculation/cash revisions, last evaluation
  time and successful daily evaluation time are saved together. Default
  [job handling](../../app/api/internal/jobs/commitguard/route.ts) now returns
  completed/200, not the former pending-pipeline/202 response. Missing financial
  data is a completed unavailable evaluation, not an execution failure.

## Offline verification

- [Actual system-job handler tests](../../tests/commitguard-internal-job-route.test.ts)
  execute the real summary, operational and risk evaluators using synthetic
  transactional storage, with no page request. Coverage includes missing/stale/
  incompatible/incomplete inputs, watch/at-risk/shortfall, unchanged deduplication,
  same-day repeated severity, SAFE/recurrence, competing dispatch, retry-stable
  identity, preferences/access suppression, legacy amount history, exact OR
  thresholds, zero baseline, decreases, future revisions and final-fence rollback
  of events/relevance/state together.
- [Mutation tests](../../tests/commitguard-lifecycle.test.ts) assert matching audit
  and work revisions, changed-field amounts, explicit currencies and rollback.
- Full Node suite (`npm run test`): **3,768 passed, 0 failed**.
- Full repository lint (`npm run lint`): **0 errors**, one existing unused
  `isVisible` warning in [settings navigation](../../lib/settings/navigation.ts).
- TypeScript (`npx tsc --noEmit --pretty false`): **48 pre-existing diagnostics**,
  none in this task's changed implementation/test files. Project-wide compilation
  is not clean; task 6.5's verification captured the same baseline count.
- Editor diagnostics for all changed TypeScript files: none.
- `git diff --check`: passed.

## Limits

No real external database, provider API, email or scheduler was used. Optional
isolated PostgreSQL execution was not performed; queue/fence concurrency evidence
here is mocked, not new live PostgreSQL/RLS proof. Existing storage-boundary
verification remains separate. No migration or scheduler activation is claimed.
Paginated history/UI, digest consumption, deployment and manual acceptance remain
their later tasks. No new requirement or threshold was invented.