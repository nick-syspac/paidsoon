# CommitGuard task 4.4 — mutation handoff verification, 2026-10-19

**UNMERGED / NOT DEPLOYED.** Only task 4.4 of
[the active change](../../openspec/changes/fix-commitguard-cash-protection-workflows/tasks.md)
was implemented. No checkbox was changed. The owner-approved D5 lifecycle matrix
and D7 calculation-revision meaning were preserved; no spec/design change,
worker code, scheduler activation, shared DB/API access or email sending was added.

## Paths and contract

- [Commitment/settings services](../../lib/commitguard/service.ts): material
  create/update/pause/resume/cancel/confirm request evaluation within the existing
  tenant transaction, including small amount edits and disabled amount alerts.
  Settings now skip upsert on normalized policy no-ops, preserving updatedAt.
- [Conversion service](../../lib/commitguard/detection.ts): only new conversions
  request evaluation; original-link retries and unambiguous legacy reconciliation
  do not. Candidate edit/ignore/reject remains review-only, not a forecast input.
  Task 5 still owns review refinements; none were invented here.
- [Existing evaluation helper](../../lib/commitguard/evaluationRequest.ts):
  unchanged; increments once and inserts safe-column pending work with DB defaults.
- [Lifecycle/rollback offline tests](../../tests/commitguard-lifecycle.test.ts),
  [creation/conversion offline tests](../../tests/commitguard-creation-allowance.test.ts),
  [settings/no-op tests](../../tests/commitguard-settings-policy.test.ts) and
  [custom recurrence regression double](../../tests/commitguard-custom-recurrence.test.ts).
- [Extended PostgreSQL verifier](../../scripts/verify-commitguard-creation-storage.ts)
  and [runbook lifecycle/handoff matrix](../runbooks/commitguard.md#task-44-revision-and-pending-work-handoff--unmerged--not-deployed).

Mutation, candidate/source link, applicable audit, calculation revision and work
commit or roll back together. No-op lifecycle/PATCH/settings retries perform no
timestamp/revision/work write. Conflicts do not consume revisions. Legacy link
repair may change conversion metadata/status but not calculation inputs or work.

## Commands and results

```sh
SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password node --experimental-test-module-mocks --import tsx --test tests/commitguard-lifecycle.test.ts tests/commitguard-creation-allowance.test.ts tests/commitguard-custom-recurrence.test.ts tests/commitguard-settings-policy.test.ts tests/commitguard-routes.test.ts
node --experimental-test-module-mocks --import tsx --test scripts/verify-commitguard-creation-storage.ts
npm test
node_modules/.bin/eslint lib/commitguard/service.ts lib/commitguard/detection.ts tests/commitguard-lifecycle.test.ts tests/commitguard-creation-allowance.test.ts tests/commitguard-custom-recurrence.test.ts tests/commitguard-settings-policy.test.ts scripts/verify-commitguard-creation-storage.ts
node_modules/.bin/tsc --noEmit --incremental false --pretty false
openspec validate fix-commitguard-cash-protection-workflows --type change --strict
```

| Gate | Result |
| --- | --- |
| Targeted offline real-service/route regressions | 141 passed, 0 failed, 0 skipped |
| Authorized isolated PostgreSQL verifier | 55 passed, 0 failed, 0 skipped (54 subtests plus parent) |
| Full Node suite | 3492 passed, 0 failed, 0 skipped |
| Affected ESLint | Exit 0, no diagnostics |
| Project TypeScript | 48 existing unrelated diagnostics; none in affected source/tests/script |
| Strict OpenSpec validation | Passed; whitespace check also passed |

The 48 TypeScript diagnostics match the preceding task 4.3 verification: 22
generated development-route diagnostics, five accounting-trigger-sync test
diagnostics, 16 DepositGuard test diagnostics, four SpendLeak evidence diagnostics
and one trial-access E2E-plan diagnostic. No unrelated code was changed to hide
these. No production build or browser acceptance was run for this bounded task.
The runbook retains existing editor Markdown warnings (hard tabs and an older
section fragment); unrelated formatting was not rewritten. This verification
record has no editor diagnostics.

## Storage evidence and limits

The verifier hard-pins the authorized Unix socket
`/tmp/paidsoon-commitguard-pg.i62Iri`, port `55437`, user `syspac`, database
`commitguard` as TEMPLATE. It checks socket identity and TCP-disabled state,
creates a uniquely named disposable clone and installs only clone-local test
auth/RLS scaffolding and failure triggers. Only the connection factory and
effective-access input loader are mocked; real services, effective-access
resolver/plan rules, withUserContext, Prisma adapter, SQL locks and restricted
pending-work grants execute.

Evidence includes:

- Every approved lifecycle source/action/confidence combination with exact
  revision/work/no-op outcomes, original conversions and legacy reconciliation.
- Actual blocked transactions competing for the last slot and duplicate
  conversion/lifecycle/PATCH requests, with one revision and pending item.
- Three actually blocked settings/create/lifecycle operations serialized into
  revisions 8, 9 and 10, each with its own pending work identity.
- Real revision-write, work-insert and audit-insert failure triggers across
  manual creation, conversion, PATCH and all four lifecycle actions. Settings
  revision/work failures are also tested; settings have no lifecycle audit.
- Before/after full tenant row snapshots include settings, work, commitments,
  candidates and events: failure preserves all content, not just counts.
- Initial missing settings create revision 1; an unexpected pre-existing work
  dedupe key rolls back rather than being suppressed. Pending state, zero
  attempts/fence, null lease/completion and mutation source/revision are verified.
- No-op settings retries preserve updatedAt. Candidate review creates no
  evaluation until conversion. Access-removal waits, foreign ownership, archived
  conflicts, legacy ambiguity and cancelled-but-unarchived allowance regressions
  remain covered.

Cleanup drops the clone and checks source row counts/content digests, schema,
ACLs, constraints, policies, functions/triggers, roles, memberships and database
inventory against the original baseline. Source data and trial/billing objects
remain unchanged. No role change, server restart, environment-derived DB URL,
shared migration/policy application, external provider call or real email occurs.

Durable requests are not executed here. Task 6 work claims/fences/current-access
checks, recovery/dispatch, later CashPlan/UI/digest consumption and actual-target
rollout remain separate. No immediate-email or deployed-worker claim is made.