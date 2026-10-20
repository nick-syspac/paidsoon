# CommitGuard task 7.2 review and verification — 19 October 2026

**UNMERGED / NOT DEPLOYED.** Review and finish of inherited task 7.2 changes
only. No task checkbox changed. No task 7.3 filter/pagination expansion,
migration, SQL application, scheduler activation, package installation or real
email/provider request was performed.

## Reviewed contract and paths

- [Workspace DTO](../../lib/commitguard/workspace.ts),
  [loader](../../lib/commitguard/workspaceLoader.ts), and
  [endpoint](../../app/api/commitguard/workspace/route.ts): one injected clock
  and tenant-scoped RepeatableRead transaction for summary, saved cash,
  settings, commitments, candidates/review count, renewals and history.
  Responses omit tenant identity, raw candidate payloads and lease metadata.
  The authenticated subscription/core boundary rejects malformed, unknown and
  duplicate navigation query keys; responses are private/no-store.
- [Client store](../../lib/commitguard/workspaceClient.ts) and
  [provider](../../components/dashboard/commitguard/CommitGuardWorkspaceProvider.tsx):
  replace the entire DTO, reject inconsistent copied cash/settings/count/clock
  sections, invalidate older requests before a mutation, and reject stale
  deferred responses or server props. Successful mutations request coherent
  GET refresh and server refresh; failed GET retains the prior complete
  revision with explicit stale-figures messaging and GET-only retry.
- [Dashboard](../../components/dashboard/commitguard/CommitGuardDashboard.tsx)
  and [server page](../../app/dashboard/commitguard/page.tsx): use that shared
  contract instead of independently retained financial props. Existing limited
  navigation behavior is preserved, not expanded to task 7.3.
- [Commitment controls](../../components/dashboard/commitguard/CommitGuardWorkspace.tsx),
  [candidate controls](../../components/dashboard/commitguard/CommitGuardCandidateReview.tsx),
  [cash panel](../../components/dashboard/commitguard/CommitGuardCashContextPanel.tsx),
  [cash form](../../components/dashboard/commitguard/CommitGuardCashContextForm.tsx),
  [settings](../../components/settings/CommitGuardSettingsClient.tsx), and
  [settings transfer](../../components/settings/CommitGuardSettingsTransferClient.tsx):
  refresh after successful writes, distinguish save success from refresh
  failure, and preserve unrelated unsaved drafts.

## Issues corrected during this review

1. Added a synchronous shared writer guard across workspace mutation transports.
   Competing cash/candidate/lifecycle writes and mid-write reads cannot race to
   publish a partial post-mutation workspace. Deferred reads retain the prior
   complete DTO until one replacement is ready.
2. [Cash save orchestration](../../lib/commitguard/cashContextClient.ts) now
   attempts workspace/server refresh even when its independent cash-context
   GET fails after PUT succeeds. Neither failure path replays the PUT.
3. Browser testing found local commitment/candidate reload latches could remain
   set after a successful provider GET retry. Provider-owned failures now use
   the provider retry state instead of retaining an independent local lock.
4. Removed an inherited duplicate module mock in
   [CostGuard linkage tests](../../tests/commitguard-costguard-links.test.ts)
   that cancelled both linkage tests in the first full-suite run.

## Automated verification

| Check | Result |
| --- | --- |
| Full Node suite | **3,802 passed**, 311 suites; 0 failed/cancelled/skipped |
| Focused workspace/page/cash/candidate renderer tests | **33 passed**, 0 failed |
| Lint | **0 errors**, one existing unused `isVisible` argument warning in [settings navigation](../../lib/settings/navigation.ts#L76) |
| TypeScript project check | Exit 2, **48 unrelated diagnostics**: 22 generated Next dev route types, 26 accounting-trigger/DepositGuard/SpendLeak/trial-access test diagnostics; none in task 7.2 implementation/tests |
| Editor diagnostics on reviewed implementation files | None |
| Strict OpenSpec validation and diff whitespace check | Passed |

[Workspace client tests](../../tests/commitguard-workspace-client.test.ts)
include six tests for all-at-once publication, revision consistency, stale and
aborted transports, mutation invalidation, GET-only retry, writer serialization,
and inconsistent copied sections. Three
[loader/route/renderer tests](../../tests/commitguard-workspace.test.ts)
execute actual orchestration against read-only mocked delegates, assert one
tenant RepeatableRead boundary and safe response shape, exercise access/query
rejection, and render the actual dashboard. Cash-client regressions assert
workspace/server refresh is attempted after independent GET failure.

## Actual-component synthetic browser verification

Used the [browser harness](../../tests/fixtures/commitguard-workspace-browser.mjs)
on an isolated local port. It bundles actual React dashboard/provider/forms,
the real summary engine, and actual store; only transport and Next router/link
are synthetic. The router records refresh invocations rather than executing
Next server-component navigation. No external database, Supabase, Stripe,
Resend or provider was contacted. Eight scenario groups passed:

1. Pause -> failed coherent GET -> GET-only retry: one POST, two GETs, two
   server-refresh calls; committed cash becomes zero, renewal disappears,
   cash/edit drafts survive, stale server props cannot roll back revision 2,
   and retry releases the mutation lock.
2. Deferred mutation blocks competing cash/detection writes; deferred GET
   keeps one complete displayed revision until released: one POST, two GETs.
3. Cash PUT succeeds while independent cash GET fails: coherent revision 2 and
   server refresh still occur; retry uses reads only, exactly one PUT total.
4. Candidate edit/confirm/detect/ignore: four writes, four coherent GETs and
   four server-refresh calls; review count follows 1 -> 0 -> 1 -> 0 and the
   confirmed commitment appears in the shared workspace.
5. Standalone settings and import each succeed then fail refresh: two PUTs,
   four GETs/four server-refresh calls including retries; intervening settings
   and JSON drafts survive; retries do not repeat writes.
6. Commitment edit/pause/resume/cancel/create: five writes, five coherent GETs,
   five server-refresh calls; revision advances to 6. At 375px there is no
   document-level horizontal overflow in the synthetic harness.
7. Candidate ignore followed by failed GET and global retry releases candidate
   controls without replaying the review.
8. Candidate 409 followed by explicit reload preserves the candidate draft,
   sends no second write and keeps calculation revision 1.

Store tests separately cover out-of-order aborted responses even when transport
ignores cancellation. Browser observations do not prove database isolation,
real Next router refresh delivery, authenticated deployment behavior, production
CSS responsiveness, or scheduler rollout. No production build, worker suite or
live-database verification was run for this TypeScript/UI-only review. Existing
deployment/storage authorization prerequisites remain unchanged.