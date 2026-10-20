# CommitGuard task 9.4 — isolated scheduled-workflow verification

## Scope and verdict

Only task 9.4 of `fix-commitguard-cash-protection-workflows` was exercised.
No task checkbox, production implementation, schema, policy artifact, deployment,
shared database, scheduler configuration or real delivery was changed.

The integrated local path is reproduced successfully, with **one confirmed
existing digest regeneration blocker**. This is not full acceptance, deployed
RLS evidence, or certification that Railway is running this extension.

Evidence was recorded on 2026-10-20 local time. The actual PostgreSQL/Node UTC
evaluation date during execution was 2026-10-19; fixture dates derive from that
clock rather than hardcoding a future date.

## Reproducible entry points

- [Integrated verifier](../../scripts/verify-commitguard-scheduled-workflows.ts)
- [Actual Python worker stdio bridge](../../scripts/_commitGuardScheduledWorkerProbe.py)
- [Identity-checked clone/baseline helper](../../scripts/_commitGuardVerificationClone.ts)
- [Reused clone setup](../../scripts/_commitGuardBrowserDatabase.ts)

Run serially from the repository root; the database test is deliberately outside
the unit-test glob. The existing repository-local Python virtual environment is
required for the stdio bridge; no dependencies were installed.

```sh
env -i PATH="$PATH" HOME="$HOME" node --conditions=react-server \
  --experimental-test-module-mocks --import tsx --test --test-concurrency=1 \
  scripts/verify-commitguard-scheduled-workflows.ts
```

The fixture accepts no remote URL or application environment fallback. Its only
database authority is a disposable clone of database `commitguard`, role
`syspac`, PostgreSQL 17, Unix socket `/tmp/paidsoon-commitguard-pg.i62Iri`, port
55437, with TCP listening disabled. Before/after source catalogs, table-row
counts/content hashes, roles/memberships, ACLs and database inventory match after
clone removal. Cleanup also ran after unsuccessful development attempts.

## Actual execution boundary

The integration runs this connected sequence, not separate function-shape mocks:

1. Persist synthetic outgoing provider evidence and a source batch.
2. Complete that batch in an actual tenant transaction and call the production
   completion helper in the same transaction; observe its durable pending row.
3. Invoke actual Python dispatcher twice through a test-only stdio bridge.
   Each API adapter call invokes the real Node dispatch handler with its actual
   secret check, scanner, repair and current central access resolution.
4. Fail mocked Redis enqueue on the first pass. Observe unchanged pending work;
   the second real scan rediscovers it. Execute the actual Python per-item task
   through the real Node job handler, claim, tenant financial transaction,
   detector, final fence and completion.
5. Execute daily evaluation through the actual job handler, operational/risk
   services and CashPlan snapshot writer. Read persisted evaluation state and
   tenant alert-history DTOs. No page/component/GET handler is used to trigger it.
6. Run the real CommitGuard digest provider, provider registry, generator,
   persistence, email rendering and existing Owner's Digest mailer. Replace only
   recipient lookup and Resend transport; capture exactly one non-delivering
   message with synthetic recipient and message ID.

Database binding is substituted only to route the real Prisma services to the
authorized clone. `withUserContext`, effective-access loaders/resolver, billing
feature checks, claims, source helper, scanner, detector, evaluation, financial
fences, history, CashPlan and digest persistence are **not mocked**. No Supabase
session is needed for internal-secret handlers. Recipient Auth lookup is stubbed;
no Stripe/Supabase/provider API is called. Provider evidence is synthetic DB data,
not proof of successful real provider ingestion.

The helper initially installs legacy fixture policies; the verifier replaces
these for its listed legacy tables with actual canonical CREATE POLICY statements
and exact canonical grants before importing/executing services. The actual
CommitGuard targeted artifact is applied by clone setup. The actual CashPlan
targeted artifact is compared with its canonical block and applied twice. No
diagnostic CashPlan grants or permissive CashPlan policies are added.

Canonical CashPlan settings have SELECT permission but no defined policy in the
canonical artifact: this test keeps RLS deny-all there and uses the plan fallback.
It does not claim settings-row visibility is accepted. The clone's minimal
`auth.uid()` shim is not a deployed Supabase Auth implementation.

## Exact results

| Check | Result |
| --- | --- |
| Integrated verifier | **12 passed, 0 failed, 0 skipped**: 11 subtests plus parent |
| Existing focused mocked Node regressions | **132 passed, 0 failed, 0 skipped** |
| Existing CommitGuard worker tests | **8 passed** |
| Full worker discovery on current Python 3.9.6 | **27 run, 1 failure** in unrelated HTTP-server import; not a green full-worker result |
| New TypeScript script ESLint | **0 errors, 0 warnings** |
| Repository TypeScript | **48 unrelated diagnostics**, none in the new script; matches previously recorded count, not claimed byte-identical |
| External fetch calls during integration | **0** |
| Mock Resend captures | **1** |
| Real emails / broker publications / page visits | **0 / 0 / 0** |
| Source baseline comparison and clone cleanup | **Passed** |

The 12 green tests include an **expected-error blocker reproduction**. They do
not mean that digest replay acceptance passed. Totals above are separate runs,
not a combined full-suite number. Task 9.1 full Node/build/schema verification
was not rerun as part of this task-9.4-only request.

Focused Node regression command:

```sh
env -i PATH="$PATH" HOME="$HOME" \
  SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password \
  node --experimental-test-module-mocks --import tsx --test \
  tests/commitguard-work-side-effects.test.ts \
  tests/commitguard-work-lifecycle.test.ts tests/commitguard-work-scan.test.ts \
  tests/commitguard-internal-job-route.test.ts tests/commitguard-source-repair.test.ts \
  tests/commitguard-operational-evaluation.test.ts tests/commitguard-risk-evaluation.test.ts \
  tests/commitguard-digest-provider.test.ts tests/commitguard-alert-history.test.ts
```

Worker commands used the configured repository interpreter:

```sh
env -i PATH="$PATH" HOME="$HOME" PYTHONPATH="$PWD/worker" \
  "$PWD/.venv/bin/python" -m unittest discover -s worker/tests -p test_commitguard.py -v
env -i PATH="$PATH" HOME="$HOME" PYTHONPATH="$PWD/worker" \
  "$PWD/.venv/bin/python" -m unittest discover -s worker/tests -v
```

## Verified cases

- Missing secret and malformed identity reject before financial writes.
- Completion handoff persists once; duplicate source replay does not recreate work.
- Actual worker lost-enqueue/restart-style rediscovery leaves PostgreSQL as owner.
- Five-minute interval is 300 seconds; release gate remains false before/after
  process-local mocking and no Beat schedule is registered. No live five-minute
  wait or scheduler process was started.
- One UTC daily identity; daily success state and real CashPlan snapshot, with no
  CashPlan permission workaround, HTTP callback or page-triggered evaluation.
- Source repair restores successful accounting-run/import gaps, rejects
  partial/failed sources and preserves an exhausted generation.
- Missing/day-eight stale cash emits no cash-risk event; a day-45 obligation
  emits no due-soon event.
- Queued jobs observe actual disabled, detection-opt-out and revoked billing
  rows, without candidate/event/evaluation-state/snapshot publication.
- Expired lease recovers with actual backoff; advancing only clone due metadata
  permits a higher-fence claim. Old owner/fence and superseded revisions cannot
  publish financial changes.
- Final module-disable fence rolls back the entire default pipeline, including
  events, evaluation state and CashPlan snapshot.
- Separate committed billing revocation after financial computation is observed
  by final access recheck; all financial publication rolls back.
- Relevant risk event reaches provider and first persisted digest exactly once;
  no duplicate live `FREE_CASH_RISK` signal accompanies it. First generation has
  three items and nine metrics, with CommitGuard provider `complete` and CashPlan
  `partial` (bounded/preliminary).
- Email opt-out and non-email plan entitlement produce no additional transport
  call or delivery for the denied tenant. Category/module disable suppresses
  stored signals without deleting history.

## Confirmed local blocker — digest regeneration with canonical RLS

[Canonical digest policy block](../../prisma/rls-policies.sql#L1696-L1750)
defines SELECT/INSERT/UPDATE policies on digest items, metrics and provider runs,
while the grants allow DELETE. There is no DELETE/ALL policy for these tables.
[Existing snapshot replacement](../../lib/ownersDigest/service.ts#L993-L1010)
calls `deleteMany` then inserts replacement children. Under authenticated RLS,
deletion affects zero rows. Same-period regeneration attempts to insert an
existing stable item identity and raises **P2002**. The transaction rolls back;
stored item count and the single delivery row remain unchanged, with **no second
mock transport call**. The mailer regenerates before checking the existing
delivery key, so this run cannot certify an `already_sent` replay result.

The verifier asserts the error and absence of DELETE policies and prints a
`9.4 BLOCKERS` record. No policy, grant, sender, delivery subscription or runtime
behavior was changed to conceal this result. Resolving it needs separate scope
and reviewed policy/runtime work.

## Other limitations and deployment-dependent checks

- Other digest providers report `unavailable` in this narrow canonical-table
  fixture (PaidSoon, SpendLeak, Tax Buffer, DepositGuard, MarginGuard, RunwayGuard).
  The registry retains these failures and snapshot completeness is `partial`.
  No unrelated provider was mocked into success. This is not whole-digest
  cross-module acceptance or a diagnosis of deployed provider state.
- Full worker discovery fails importing the unrelated HTTP server because the
  selected local Python 3.9.6 does not support its evaluated `str | None`
  annotation. The declared Docker runtime is Python 3.12. Eight CommitGuard
  worker tests and the actual-worker stdio integration pass on the selected
  environment; no runtime/dependency change was authorized or made.
- Runtime warnings remain: experimental Node module mocks, deprecated
  `namedExports`, and pg concurrent query deprecation from existing Prisma
  transaction behavior. They were not changed by this verification.
- Real Railway Beat/worker versions, one owner per environment, five-minute
  wall-clock delivery, daily unattended execution, Redis outage/restart recovery,
  internal HTTP networking/secret distribution and deployed database ACLs remain
  **unverified and require separately authorized deployment checks**.
- Real provider ingestion, Supabase sessions and actual Resend acceptance/inbox
  delivery are intentionally untested. The log's existing `delivered` event means
  only the mocked Resend return in this process, never a real email.
- No shared SQL application, Vercel/Railway scheduler activation, destructive
  cleanup, repository commit or task-checkbox change occurred.
