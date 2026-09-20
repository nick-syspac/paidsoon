# RunwayGuard Operations Runbook

This runbook covers RunwayGuard summary, scenario, history, settings, and background snapshot operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Runway summary, timeline, drivers, history, scenarios, and settings are live.
- Background runway snapshot sweeps are live.
- RunwayGuard consumes usable cash, protected cash, and shared cash-planning inputs rather than maintaining a separate ledger.

## 1. Operational flows

### 1.1 Runway summary and timeline

Primary user-facing surface:

- `/dashboard/runway-guard`

Primary routes:

- `GET /api/runway-guard/summary`
- `GET /api/runway-guard/timeline`
- `GET /api/runway-guard/drivers`
- `GET /api/runway-guard/history`
- `GET/PUT /api/runway-guard/settings`

Primary paths:

- `lib/runwayGuard/service.ts`
- `lib/runwayGuard/foundation.ts`
- `lib/runwayGuard/settings.ts`

### 1.2 Scenario analysis

Scenario endpoint:

- `POST /api/runway-guard/scenarios`

Operational notes:

- Scenario output remains tenant-scoped and uses the same core summary logic as the main runway view.
- RunwayGuard depends on usable-cash, protected-cash, and committed-outflow assumptions rather than on isolated manual inputs alone.

### 1.3 Snapshot sweep

Cron endpoint:

- `GET /api/cron/runway-guard-snapshots`
- Auth: `Authorization: Bearer CRON_SECRET`

Primary path:

- `lib/runwayGuard/snapshotJob.ts`

Operational notes:

- Snapshot sweeps keep history and trend views current.
- Missing sweep execution can leave the runway history stale even when on-demand summary routes still respond.

## 2. Environment variables

RunwayGuard introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- `CRON_SECRET`
- Existing auth and database configuration.
- Upstream CashPlan, CommitGuard, and Tax Buffer inputs when the tenant is using those modules.

Setup remains centralized in `vercel.md`, `supabase.md`, and the related module runbooks.

## 3. Operational boundaries

- RunwayGuard is a planning and monitoring tool. It should not be described as a guarantee of future liquidity.
- Snapshot history depends on background sweeps, while summary routes can still compute current outputs on demand.
- Scenario analysis depends on the quality of current upstream assumptions.

## 4. Troubleshooting

### 4.1 History is stale but current summary loads

Likely causes:

- `GET /api/cron/runway-guard-snapshots` is not running or is failing.
- The tenant has current on-demand inputs but no recent persisted snapshot.

Actions:

1. Verify the runway snapshot cron is succeeding in Production.
2. Check whether the tenant has recent `RunwayGuardSnapshot` rows.
3. Distinguish stale history from broken summary generation before escalating.

### 4.2 Runway outlook seems unrealistic

Likely causes:

- Protected-cash assumptions are out of date.
- CashPlan or CommitGuard inputs changed.
- The tenant's settings or horizon differ from the operator's expectation.

Actions:

1. Compare the current runway summary with Tax Buffer and CashPlan context.
2. Check current RunwayGuard settings and horizon.
3. Re-run scenario analysis only after confirming the upstream assumptions.

### 4.3 Scenario output differs sharply from baseline

Likely causes:

- Scenario multipliers or overrides are intentionally material.
- Baseline and scenario requests are not using the same starting inputs.

Actions:

1. Compare request inputs between `/api/runway-guard/summary` and `/api/runway-guard/scenarios`.
2. Check whether the scenario type changed from base to conservative, stress, or custom assumptions.
3. Treat unexplained divergence as an input mismatch before treating it as a snapshot defect.