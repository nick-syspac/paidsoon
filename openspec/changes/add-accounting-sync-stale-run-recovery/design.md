# Design

## Context

See [proposal.md](proposal.md) for motivation. The current sync orchestrator treats any existing `accounting_sync_runs` row with `status = running` as an active lock for that connection. If an execution terminates before writing completion state, later sync attempts always return "already in progress" and never recover without manual intervention.

## Goals / Non-Goals

**Goals:**

- Recover stale `running` rows automatically during normal sync entry.
- Preserve the existing no-concurrent-sync guarantee for genuinely active runs.
- Produce an auditable terminal state for recovered stale rows.

**Non-Goals:**

- No new database tables, enums, or schema changes.
- No cross-workflow stale cleanup beyond accounting sync.
- No background standalone sweeper introduced in this change.

## Decisions

### Decision 1: Recover stale runs inside `syncConnection` before the in-progress guard

At the start of `syncConnection(connectionId)`, perform a stale-running reconciliation for that connection:

- Target rows where `status = running`, `completedAt IS NULL`, and `startedAt` is older than a fixed staleness threshold.
- Update matched rows to terminal state (`status = failed`, `completedAt = now`, deterministic `errorMessage` such as `stale_running_recovered`).
- Use an update predicate that rechecks `status/completedAt` to keep behavior idempotent under concurrent invocations.

Rationale: placing recovery at sync entry guarantees cleanup on both manual and cron paths without adding a separate scheduler dependency.

Alternative considered: periodic global sweep route. Rejected for this scope because it adds operational moving parts and can still leave blocked syncs between sweep intervals.

### Decision 2: Keep fresh `running` rows as hard blockers

After stale reconciliation, run the existing in-progress check. If a non-stale `running` row remains, return the existing informational skip behavior.

Rationale: preserves current anti-concurrency correctness while unblocking only clearly stale locks.

Alternative considered: queue second run automatically. Rejected because queueing semantics are out of scope and would require broader orchestration contract changes.

### Decision 3: Use deterministic recovery reason for support visibility

Recovered rows receive a fixed machine-readable error marker in `errorMessage`.

Rationale: supports runbook diagnosis and test assertions without exposing sensitive internals.

Alternative considered: free-form error text. Rejected because it is harder to monitor and assert consistently.

## Risks / Trade-offs

- [Risk] Threshold too short may terminate a legitimately long run. -> Mitigation: choose a conservative threshold comfortably above expected sync durations and existing route `maxDuration` values.
- [Risk] Concurrent sync starts race to recover the same stale row. -> Mitigation: idempotent conditional update and post-recovery recheck of active `running` rows.
- [Risk] Support confusion over newly failed recovered rows. -> Mitigation: deterministic recovery reason plus runbook update.

## Migration Plan

- No data migration or schema rollout required.
- Deploy code and tests together.
- Rollback by reverting the stale-recovery logic; existing recovered rows remain valid historical audit data.

## Open Questions

- None.
