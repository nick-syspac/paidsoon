# CommitGuard task 9.2 — isolated storage verification

Updated: 2026-10-20. Change: `fix-commitguard-cash-protection-workflows`.

## Verdict

**Local isolated checks pass; cross-cutting acceptance/rollout remains pending.**
The two CashPlan ACL blockers reported on October 19 are resolved in local source
and isolated tests by the approved narrow D9 dependency. There are no diagnostic
CashPlan grants or synthetic CashPlan ownership policies in the updated runtime
verifier. The 2026-10-20 acceptance review finds task 9.2 fully met for its isolated
migration/CHECK/RLS/concurrency and preservation scope. This is not deployed RLS
proof, shared-target review, or authorization to apply SQL or activate a scheduler.

Only the authorized PostgreSQL 17 Unix socket on port 55437, role `syspac`,
template database `commitguard` was used. Each verifier checks socket/database/
role identity and TCP-disabled configuration before DDL. Migration replay used a
new disposable database; every other probe used its own disposable template clone.
No application environment loader, external API, email, shared database SQL,
scheduler activation, or cluster-role change was used. All run-created databases
were removed; pre-existing databases were preserved.

## Executed evidence

| Group | Nested cases | Parent tests | Result |
| --- | ---: | ---: | --- |
| Coverage real services/concurrent transactions | 8 | 1 | Pass |
| Creation/conversion/lifecycle/mutation handoff | 54 | 1 | Pass |
| Current cash/jobs/repair/retry/CashPlan | 12 | 1 | Pass with actual CashPlan artifact, including 53 raw role/identity probes |
| Trusted financial side-effect fence/role restoration | 10 | 1 | Pass |
| Supplemental CHECKs | 126 | 1 | Pass |
| Canonical targeted RLS/column grants | 129 | 1 | Pass |
| **Storage total** | **339** | **6** | **345 passed; 0 failed/skipped/todo** |

Additional focused offline/mocked tests: **392 passed, 0 failed/skipped/todo**,
including five new ACL source-contract tests. The 53 raw SQL probes are assertions
inside one runtime case, not 53 extra Node tests.
Affected ESLint: exit 0, no warnings/errors. TypeScript: exit 2, **48 diagnostics**;
sorted diagnostic lines are identical to the task 9.1 after-baseline, with none in
the affected verification scripts or work-lifecycle regression files.

### Independent acceptance-review check, 2026-10-20

- Recorded migration/storage/unit log SHA-256 values below were rechecked and
  match; the recorded full storage result remains **345 passed, zero failed**.
- Focused offline ACL source contract rerun: **5 passed, zero failed**.
- Before the independent runtime rerun, a read-only preflight confirmed the exact
  approved PG17 socket/template identity, TCP disabled, and **zero other database
  clients**. The component-only browser fixture processes do not use a database.
- Serial current-runtime rerun: **13 passed, zero failed/skipped/todo**, including
  the parent test and 12 nested cases. Its **53 raw role/identity assertions** are
  not additional Node tests. Actual targeted SQL was applied twice, without
  diagnostic grants; real refresh, fenced publication and final-fence rollback
  passed. This rerun is a subset of the recorded full storage suite, not 13 new
  unique cases to add to 345.
- Cleanup emitted: **PASS: complete original template baseline restored; this
  run's clone removed**. No shared-target access or runtime-file edits occurred.
- The verifier's static remaining-blocker text is cross-task/rollout context,
  not a failing local 9.2 assertion or a fresh browser/digest verdict.

### Migration and preservation

- Replayed **55 historical migrations**, then the existing additive migration.
- Before: **116 tables**. Added: **4 tables**, **26 existing-table columns**,
  **19 catalog indexes** (15 explicit plus 4 primary keys), **8 foreign keys**.
- The four new models are `CommitGuardCashContext`, `CommitmentCoverage`,
  `CommitGuardWorkItem`, and `CommitGuardEvaluationState`.
- Projecting out only the reviewed additions leaves exactly the original logical
  catalog, including unrelated trial/billing/profile relations, ACLs, policies,
  roles, memberships, schemas, defaults, functions, types and inverse FK triggers.
- Before/projected-after catalog SHA-256 both:
  `89169ef93f5eea5066a594802aa68a989521f0ac162be64308bb51271612c52c`.
- Migration SHA-256:
  `37d9b04ac63a1d53175c246aca7478dec1fe2163b5e908e406ab9ed843ec968e`.
- Targeted policy application/reapplication preserves unrelated clone ACL/schema;
  source before/after catalog, role, database inventory and every public-table
  row count/content digest match after clone removal. This includes whatever
  trial/billing fixtures exist locally; it is not a deployed effective-access audit.
- No schema, migration, CHECK artifact or task-list edits in this continuation.
  The approved source changes are the D9 design/spec dependency, canonical RLS,
  a CashPlan-only targeted policy artifact, runtime verifier, offline source
  tests and scoped documentation. Pre-existing user edits to the event service
  were not edited or reverted.

### Narrow CashPlan dependency and actual policy evidence

- [D9 decision](../../openspec/changes/fix-commitguard-cash-protection-workflows/design.md)
  and [acceptance scenarios](../../openspec/changes/fix-commitguard-cash-protection-workflows/specs/commitguard-forecast-and-free-cash/spec.md)
  were updated before implementation. The approved scope is local source SQL and
  isolated verification only, not broader trial/billing permission changes.
- [Targeted SQL](../../prisma/rls-cashplan-commitguard-policies.sql) matches its
  marked block in [canonical RLS](../../prisma/rls-policies.sql) byte-for-byte.
  Exactly three tables and five named ownership policies are affected. Plans
  receive SELECT only; overrides receive SELECT/explicit-column INSERT;
  snapshots receive SELECT/explicit-column INSERT with null scenario only.
  There is no client UPDATE/DELETE, plan creation or reassignment grant.
- Child ownership uses actual `plan_id` → `cash_plans.user_id`. Neither child
  table has `user_id`; descriptive owner/creator identities cannot authorize a
  foreign plan. INSERT columns include Prisma-emitted creation timestamps and
  override update timestamps; no blanket INSERT grant is used.
- Table **and column** client ACLs are reset only on those three tables. No
  schema/default grants, role changes, trial/billing/profile permissions, or
  other CashPlan table changes occur. Source/template policies were inspected:
  none existed on these three tables in the local template/historical SQL.
- The verifier stages a known permissive FOR ALL definition and an obsolete
  column UPDATE grant before applying the actual artifact. The named old policy
  is replaced and the stale grant is removed. An unknown OR-capable SELECT
  policy causes an explicit preflight abort; it is never silently kept/deleted.
  An unrelated UPDATE policy is preserved without granting client UPDATE.
- Actual artifact application twice produces equivalent policies/ACLs after
  ignoring only policy OIDs. Excluding only the three target tables' relation,
  column and policy entries leaves the complete before/after catalog identical.
  The original source catalog/data/database inventory also matches after cleanup.
- **53 real PostgreSQL role/identity probes** use separate authenticated/anon
  sessions and no application ownership WHERE clauses. They cover two-way raw
  SELECT isolation, own INSERT RETURNING, foreign plan INSERT with the caller's
  owner/creator identity, missing-subject reads, non-null foreign-scenario
  rejection, plan/owner reassignment, snapshot/override rewrites/deletes and anon
  SELECT/INSERT/UPDATE/DELETE denial. Denied mutations leave target plan links
  intact. Anon also receives a forged subject and remains denied.
- Real tenant-context Prisma manual override INSERT/RETURNING, saved-cash
  summary, explicit refresh, append-only snapshot history and full fenced job
  publication pass through actual artifact permissions. A changed final
  revision rolls snapshot/event/evaluation-state writes back atomically.

### Required isolation and concurrency coverage

- All four new tables: RLS enabled, two-way own/foreign SELECT isolation,
  owner-reassignment rejection, anonymous privilege rejection. Cash/coverage:
  own writes and cross-tenant writes tested. Work: pending-only insertion,
  protected column read/write denial, independent forged-state policy rejection.
  Evaluation state: tenant-readable, INSERT/UPDATE/DELETE denied to tenants.
- Coverage composite FKs reject foreign commitment, imported bill and tax category
  on both INSERT and UPDATE. Conversion FK rejects foreign candidate links and
  uniqueness prevents a second conversion. Referenced-row deletes are restricted.
- All **23** supplemental CHECKs exist, are validated, and reject a fixture with
  the exact SQLSTATE/constraint name; all-or-none groups, money/currency bounds,
  exactly-one coverage target and work-state shapes are exercised.
- Competing actual database transactions cover coverage caps; last-slot manual/
  conversion creation; duplicate conversion; lifecycle no-ops and atomic audit/
  revision/work; first-create and update cash revision races; competing claims;
  compare-generation retry. Locks are observed in PostgreSQL, not simulated.
- Actual claim/settle/recovery/scan/repair code covers six-attempt exhaustion,
  expired-owner fencing, lost-enqueue rediscovery, daily dedupe, both completion
  source kinds, foreign/failed/partial sources, and exhausted-generation retention.
- Real trusted fence probes cover final access/revision/lease/owner failures,
  tenant isolation, role restoration failure, rollback and clean connection reuse.

## Remaining acceptance blockers — not waived

1. Shared-target migration order and existing target policy names/role inheritance
  still need separate review and authorization. No SQL was applied to shared
  development, preview or production. Deployed RLS and deployed trial/billing
  effective access are not established by the local fixtures.
2. Browser acceptance (9.3) and the rollout-checklist deliverable (9.5) have separate
  review reports. Scheduled evaluation/non-delivering digest acceptance (9.4)
  remains blocked by the recorded same-period digest regeneration P2002; a
  passing local storage suite does not waive that blocker.
3. Task 9.1 remains open, including its 48 pre-existing TypeScript diagnostics
  and unresolved offline font-download build failure. This review did not run
  a new full Node/build/typecheck suite.
4. The earlier database-error path can mask an original SQL failure during role
  restoration as an aborted-transaction error. This was not broadened into a
  runtime refactor; successful publication and final-fence rollback pass here.

The verifier emits a nonempty remaining-blocker list. None of these checks
authorize deployment, shared SQL application or scheduler activation. Task-checkbox
acceptance is the separate, explicitly requested review of the isolated evidence.

## Verification-only corrections

- Retained the previous 9.2 UTC timestamp correction in work settlement/recovery/
  retry. The cluster's local timezone must not shift timestamp-without-time-zone
  UTC deadlines or admin-session comparisons. Real storage and mocked tests pass.
- Legacy CHECK/RLS verifiers now use disposable clones with complete source
  catalog/data/role baselines instead of rollback writes directly to the template.
  RLS verification requires existing non-login, non-superuser, non-bypass fixture
  roles; it never creates roles. CHECK verification recreates exactly its 23
  inherited constraints inside the clone before exercising the artifact.
- Initial resumed storage run exposed duplicate inherited CHECK names during this
  harness change. Corrected clone-only recreation; the final complete rerun is
  the 345-pass result above, not the initial failed run.
- This continuation first corrected a catalog-comparison OID representation
  mismatch (PostgreSQL JSON strings versus client numeric OIDs). A subsequent
  runtime run exposed Prisma's explicit `created_at` INSERT value; both source
  artifacts now allowlist it. The final full rerun, not either initial failure,
  is the 345-pass result. Source-clone cleanup passed on failed runs too.

## Reproduction commands

Run serially; parallel clones invalidate cluster-wide database-inventory baselines.
These commands use no application secrets or environment files.

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  node scripts/verify-rls-commitguard-schema-baseline.mjs --cleanup

env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  node --conditions=react-server --experimental-test-module-mocks --import tsx \
  --test --test-concurrency=1 \
  scripts/verify-commitguard-coverage-storage.ts \
  scripts/verify-commitguard-creation-storage.ts \
  scripts/verify-commitguard-current-runtime-storage.ts \
  scripts/verify-commitguard-work-storage.ts \
  scripts/verify-rls-commitguard-constraints.ts \
  scripts/verify-rls-commitguard-policies.ts

env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password \
  node --experimental-test-module-mocks --import tsx --test --test-concurrency=1 \
  tests/commitguard-work-lifecycle.test.ts tests/commitguard-work-side-effects.test.ts \
  tests/commitguard-work-scan.test.ts tests/commitguard-internal-job-route.test.ts \
  tests/commitguard-source-repair.test.ts tests/commitguard-cash-context-route.test.ts \
  tests/cashplan-*.test.ts tests/commitguard-creation-allowance.test.ts \
  tests/commitguard-coverage.test.ts

node_modules/.bin/eslint scripts/_commitGuardVerificationClone.ts \
  scripts/verify-commitguard-coverage-storage.ts scripts/verify-commitguard-creation-storage.ts \
  scripts/verify-commitguard-current-runtime-storage.ts scripts/verify-commitguard-work-storage.ts \
  scripts/verify-rls-commitguard-constraints.ts scripts/verify-rls-commitguard-policies.ts \
  scripts/verify-rls-commitguard-schema-baseline.mjs lib/commitguard/workLifecycle.ts \
  tests/commitguard-work-lifecycle.test.ts

node_modules/.bin/eslint tests/cashplan-acl-contract.test.ts
openspec validate fix-commitguard-cash-protection-workflows --type change --strict

env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
  node_modules/.bin/tsc --noEmit --pretty false --incremental false
git diff --check
```

## Raw local evidence fingerprints

Temporary logs are local evidence, not committed artifacts.

| Log | SHA-256 |
| --- | --- |
| `/tmp/paidsoon-92-cashplan-migration.log` | `869517c6ee4b922b95e4615e6dc3c32eec9f7b82393390af30034b0292e914af` |
| `/tmp/paidsoon-92-cashplan-storage.log` | `f9d99f3a2f366d0f3d0abeb88d7b98058ff19c528dd00111320bddcb4d3dd782` |
| `/tmp/paidsoon-92-cashplan-unit.log` | `302abbdd2d2e51727c887f93ad2b6602141d175301f8b48b6a760b252b9c06b8` |
| `/tmp/paidsoon-92-cashplan-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/paidsoon-92-cashplan-spec.log` | `33b0079a02244ff8d1a20f32cbeb47ac8410d8a96f7da68ca071c752a022b520` |
| `/tmp/paidsoon-92-cashplan-tsc.log` | `4a12f251c6a1ff2094df3be7ac49a73cffcb6f29e1997a03b9a2b0a5106c2af9` |

The TypeScript log is byte-identical to the prior 9.2 baseline. The targeted SQL
SHA-256 is `546af1d74b70eab402b66a0fd7c4919f151384e75e1abe4010f2347d2678a961`.
