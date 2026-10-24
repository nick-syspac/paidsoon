# Proposal

## Why

Accounting sync runs can be left in `running` after an interrupted execution (for example, process termination or request timeout), which permanently blocks subsequent manual and cron sync attempts for the same connection. This creates prolonged stale integrations that require manual database intervention.

## What Changes

- Add automatic stale-running recovery for accounting sync runs before the in-progress guard executes.
- Mark stale `accounting_sync_runs` rows as terminal (`failed` + `completedAt`) with a deterministic recovery error message so support can audit what happened.
- Keep the existing single-active-run guarantee: non-stale `running` rows still block concurrent sync attempts.
- Cover recovery behavior with targeted sync orchestrator tests for stale, fresh, and concurrent paths.
- Update operator runbook guidance to reflect the automatic recovery behavior and when manual reset is still required.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `invoice-sync`: Sync orchestration now self-recovers stale `running` rows for the same connection before deciding whether a run is already in progress.

## Impact

- Affected modules: sync orchestration in `lib/providers/accounting/sync.ts`, accounting sync tests, and MYOB/operator runbook text.
- API/contract impact: no route shape changes; behavior changes for repeated sync triggers when a stale `running` row exists.
- Data impact: no schema migration; existing `accounting_sync_runs` rows can be updated from stale `running` to `failed` with a deterministic recovery reason.
- Security and tenancy: unchanged boundaries (`prismaAdmin` in background sync context, tenant-scoped user routes remain unchanged).
- Non-scope: no new scheduler, no global stale-run sweeper for unrelated workflows, and no automatic disconnect/reconnect of accounting connections.
