# Tasks

## 1. Sync stale-run recovery logic

- [x] 1.1 Add a stale-running threshold constant and connection-scoped reconciliation step in `lib/providers/accounting/sync.ts`, and verify stale `running` rows are marked `failed` with `completedAt` and deterministic recovery `errorMessage`.
- [x] 1.2 Execute stale reconciliation before the existing in-progress guard and verify non-stale `running` rows still produce the current "already in progress" skip behavior.
- [x] 1.3 Ensure recovery updates are idempotent under concurrent starts (conditional update predicate + recheck), and verify no duplicate active run starts for the same connection.

## 2. Test coverage

- [x] 2.1 Add/extend accounting sync orchestrator tests to verify stale `running` rows are auto-recovered and sync proceeds.
- [x] 2.2 Add/extend tests to verify fresh `running` rows are not recovered and still block a second sync attempt.
- [x] 2.3 Add/extend tests for concurrent entry attempts to verify stale recovery is race-safe and does not create duplicate sync run execution for one connection.

## 3. Documentation and validation

- [x] 3.1 Update MYOB/operator troubleshooting docs to state stale `running` accounting sync rows are auto-recovered on next sync trigger and when manual reset remains appropriate.
- [x] 3.2 Run targeted tests (`npm run test -- tests/accounting-sync*.test.ts` or equivalent project command) and verify stale-recovery scenarios pass without introducing real external provider calls.
