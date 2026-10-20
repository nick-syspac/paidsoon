# CommitGuard task 6.1 verification — 2026-10-19

Local working-tree verification only; not a deployment or merged-feature claim.

## Scope

- Added `withCommitGuardWorkSideEffects` as an internal building block for task 6.2, not a route or job claim implementation.
- Tenant financial callbacks run inside the real `withUserContext` transaction under `authenticated` RLS.
- Lock order is the existing tenant advisory key, then the tenant/kind-matched work row, then callback financial rows.
- Private static role switches cover only work locking/assertions, the private platform-owner role fact, and allowlisted evaluation-state persistence. No privileged callback, SQL fragment or role name is accepted.
- Evaluation-state data is staged synchronously. The privileged state write occurs after caller code finishes, so concurrent financial operations inside the callback cannot observe that elevation.
- Admission and finalization read fresh profile/grant/risk/settings facts and use the central effective-access resolver and financial-job policy. Queue permissions are not inputs.
- Expected calculation revision, processing state, lease owner, fence, and unexpired at-most-60-second lease are asserted conditionally on the work row in the same transaction. The assertion after callback/state writes uses PostgreSQL wall time, not transaction-start time. Failure rolls back all effects.
- Lease comparisons explicitly interpret Prisma's timestamp-without-time-zone columns as UTC, independent of the PostgreSQL session timezone.
- Independent detection sources can retain ingestion revision zero while each execution supplies the current calculation revision. Stale evaluation work cannot publish against a newer revision.
- Callback results pass through only after successful validation. Optional completion updates only that work row. A failed protected operation remains fatal even if caller code catches it.

No task checkbox, route, scheduler, event evaluator, schema, migration, canonical ACL or existing service was changed. Claiming, source-identity validation, safe job response DTOs, dispatch/retry/renewal/recovery and superseded-work skip orchestration remain subsequent tasks.

## Evidence

| Verification | Result |
| --- | --- |
| Actual-helper unit tests | 6 passed; dependency transactions simulated, real boundary implementation and central access policy executed |
| Isolated PostgreSQL verifier | 11 passed, including the parent test |
| Full offline Node suite | 3,678 passed, zero failed/skipped |
| ESLint on the three new TypeScript files | Passed |
| Editor diagnostics on the three new TypeScript files | None |
| Project TypeScript | 48 pre-existing diagnostics; unchanged from the captured baseline after excluding the helper's corrected initial nullability errors; none in new files |
| Whitespace check | Passed |

The storage verifier uses only the authorized Unix socket `/tmp/paidsoon-commitguard-pg.i62Iri`, port 55437, role `syspac`, and a disposable database cloned from `commitguard`. Exact database/socket/no-TCP identity is checked before setup. Only its connection factory is substituted; the helper, tenant context, effective-access reads/resolver, Prisma adapter, lock SQL and RLS execute for real.

Clone-only fixtures apply the CommitGuard ACL artifact and canonical legacy grants/read-only access columns. The executor is the existing privileged connection role; `authenticated` is verified non-superuser, non-bypass-RLS and non-login. No roles or memberships are changed. A state-table trigger records the actual execution role and proves protected writes run as `syspac`, while callback assertions verify `authenticated` and the expected `auth.uid()`.

Storage cases cover successful result/completion; foreign financial rows hidden by RLS; actual privilege denials on work/state/private columns; wrong tenant/item/kind/owner/fence/revision/state; expired and overlong leases; disabled module/detection; missing or downgraded access; revoked/expired grants; revocation and revision changes during callbacks; preservation of newer pending work; independent detection revisions; and actual blocked tenant/work/candidate sessions.

The lease-expiry case writes a candidate and event, stages protected state, advances real database wall time past expiry, and proves all candidate/event/state/work changes roll back. Protected-state SQL failure and an injected real SQL error during role restoration also roll back all effects. Reuse of the same single-connection pool verifies restoration of the session role/JWT context and subsequent authenticated execution.

The verifier drops its clone in `finally` and compares the template's full public-table data fingerprints, public/auth relations and columns, constraints, policies, functions, triggers, cluster roles/memberships and database inventory with the original baseline. Comparison passed. No shared database, external API, email delivery or scheduler was used or activated.