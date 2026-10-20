# CommitGuard task 4.3 — lifecycle verification, 2026-10-19

**UNMERGED / NOT DEPLOYED.** Scope: the explicitly approved D5 lifecycle matrix,
tenant/row-locked updates and actions, no-op retries and changed-field audit.
The [design](../../openspec/changes/fix-commitguard-cash-protection-workflows/design.md)
and [lifecycle delta](../../openspec/changes/fix-commitguard-cash-protection-workflows/specs/commitguard-commitment-lifecycle/spec.md)
were updated and strictly validated **before implementation**. No task checkbox
was changed. Task 4.4 revision increments/evaluation work were not implemented.

## Exact implementation and test paths

- [Shared lock/matrix/audit helper](../../lib/commitguard/commitmentMutation.ts).
- [Real mutation services](../../lib/commitguard/service.ts).
- [PATCH route](../../app/api/commitguard/commitments/[id]/route.ts).
- [Action route](../../app/api/commitguard/commitments/[id]/actions/route.ts).
- [New real-service/route offline tests](../../tests/commitguard-lifecycle.test.ts).
- [Legacy custom regression tests](../../tests/commitguard-custom-recurrence.test.ts).
- [Existing route regressions](../../tests/commitguard-routes.test.ts).
- [Creation/conversion offline regressions](../../tests/commitguard-creation-allowance.test.ts).
- [Extended real-service PostgreSQL verifier](../../scripts/verify-commitguard-creation-storage.ts).

## Commands and results

```sh
openspec validate fix-commitguard-cash-protection-workflows --type change --strict
SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password node --experimental-test-module-mocks --import tsx --test tests/commitguard-lifecycle.test.ts tests/commitguard-custom-recurrence.test.ts tests/commitguard-routes.test.ts tests/commitguard-creation-allowance.test.ts
node --experimental-test-module-mocks --import tsx --test scripts/verify-commitguard-creation-storage.ts
npm test
node_modules/.bin/eslint lib/commitguard/commitmentMutation.ts lib/commitguard/service.ts 'app/api/commitguard/commitments/[id]/route.ts' 'app/api/commitguard/commitments/[id]/actions/route.ts' tests/commitguard-lifecycle.test.ts tests/commitguard-custom-recurrence.test.ts tests/commitguard-routes.test.ts scripts/verify-commitguard-creation-storage.ts
node_modules/.bin/tsc --noEmit --incremental false --pretty false
```

| Gate | Observed result |
| --- | --- |
| Strict OpenSpec validation | Passed before implementation and after code verification. |
| Tight offline regressions | 98 passed, 0 failed. |
| Authorized isolated PostgreSQL verifier | 29 passed, 0 failed (28 subtests plus parent); includes prior 4.1/4.2 regressions. |
| Full Node suite | 3468 passed, 0 failed, 0 skipped. |
| Affected ESLint | Exit 0, no diagnostics. |
| Project TypeScript | Exit 2; 48 unrelated existing diagnostics, no errors in task 4.3 source/tests/scripts. |

The remaining TypeScript diagnostics match the previously documented categories:
22 generated development-route errors, five accounting-trigger-sync test errors,
16 DepositGuard test errors, four SpendLeak evidence errors and one trial-access
E2E-plan error. A missing expiredAt field in the new synthetic typed fixture was
corrected; it is not counted as an accepted baseline error.

## Evidence boundaries

Offline tests mock external boundaries, not the lifecycle/update services or
route handlers. They exhaust all seven source statuses × four actions × both
confirmed/unconfirmed confidence states, test before/after audit values,
identical PATCH/concurrent retries, terminal editing, legacy custom repair,
archived rejection, safe 400/401/403/404/409/500 and rollback.

The storage verifier uses only the explicitly authorized Unix socket
`/tmp/paidsoon-commitguard-pg.i62Iri`, port `55437`, role `syspac`, database
`commitguard` as TEMPLATE. It creates one unique disposable clone, checks Unix
socket identity/TCP-disabled state, installs temporary auth/RLS fixture policy
scaffolding **in the clone only**, and executes the real services, effective
access resolver/plan rules, withUserContext, Prisma adapter and SQL locks. Only
the database connection factory and effective-access input loader are mocked.

Actual blocked sessions prove duplicate pause/cancel/confirm/PATCH creates one
audit and duplicate resume conflicts. Held commitment rows prove both actions
and PATCH wait after acquiring the tenant lock, then re-read a competing
cancel/archive change. The full matrix is repeated against PostgreSQL. Further
probes prove foreign RLS denial, independent tenant progress, audit-insert failure
rollback, access removal during lock waits, legacy-custom retention/repair and
terminal non-status editing. Calculation revision remains 7 and work count 0;
task 4.4 is deliberately untouched.

Finally cleanup drops the clone and asserts source row counts/content digests,
catalog/schema/ACLs, constraints, policies, functions/triggers, roles,
memberships and database inventory equal the original baseline. Trial/billing
objects and source fixtures were preserved. No shared database, provider API,
email, environment-derived DB URL, role change, server restart, migration or
production policy application was used.

No production build or authenticated browser acceptance was run for this bounded
task. Complete UI refresh, durable evaluation/revision work, rollout and shared
target checks remain their separate tasks; these results do not establish them.