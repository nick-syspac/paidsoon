# MarginGuard Operations Runbook

This runbook covers MarginGuard summary, alert, opportunity, export, and snapshot-sweep operations for local, preview, and production environments.

Current scope reflects shipped behavior:

- Margin summary, trends, breakdowns, customer classification, targets, and settings are live.
- Alert, event, scenario, and export APIs are live.
- Snapshot, alert, and opportunity background sweeps are live.

## 1. Operational flows

### 1.1 Summary, classifications, and analysis views

Primary user-facing surface:

- `/dashboard/margin-guard`

Primary routes:

- `GET /api/margin-guard/summary`
- `GET /api/margin-guard/trends`
- `GET /api/margin-guard/breakdowns`
- `GET /api/margin-guard/customers`
- `GET /api/margin-guard/classifications`
- `GET /api/margin-guard/classifications/[id]`
- `GET /api/margin-guard/targets`
- `GET/PUT /api/margin-guard/settings`

Primary paths:

- `lib/marginguard/engine.ts`
- `lib/marginguard/classification.ts`
- `lib/marginguard/service.ts`

### 1.2 Alerts, opportunities, and scenarios

Primary routes:

- `GET /api/margin-guard/alerts`
- `GET /api/margin-guard/alerts/[id]`
- `GET /api/margin-guard/alerts/[id]/events`
- `GET /api/margin-guard/scenarios`

Operational notes:

- MarginGuard uses deterministic analytics and background sweeps to persist alert and opportunity state.
- Cross-module context from SpendLeak, Cost Guard, CommitGuard, and CashPlan can sharpen the explanation of margin pressure without changing the upstream source-of-truth records.

### 1.3 Export and background sweeps

Export endpoint:

- `GET /api/margin-guard/export`

Cron endpoint:

- `GET /api/cron/margin-guard-snapshots`
- Auth: `Authorization: Bearer CRON_SECRET`

Sweep behavior:

- Runs snapshot upserts first.
- Runs alert sweeps next.
- Runs opportunity sweeps last.

Primary paths:

- `lib/marginguard/export.ts`
- `lib/marginguard/snapshotJob.ts`
- `lib/marginguard/alertJob.ts`
- `lib/marginguard/opportunityJob.ts`

## 2. Environment variables

MarginGuard introduces no dedicated environment variables and reuses the central matrix in `docs/runbooks/README.md`.

Relevant shared dependencies:

- `CRON_SECRET`
- Existing auth and database configuration.
- Upstream accounting/provider inputs when margin data relies on synced financial records.

Provider and cron setup remains centralized in `vercel.md`, `supabase.md`, `myob.md`, and `railway.md`.

## 3. Operational boundaries

- MarginGuard exports are dataset-based analysis files, not accounting-system import formats.
- Snapshot, alert, and opportunity generation are background processes; missing sweeps can make dashboard state look stale even when routes are healthy.
- Feature gating for `marginguard_core` and `csv_export` still applies.

## 4. Troubleshooting

### 4.1 Dashboard data appears stale

Likely causes:

- The margin snapshot cron has not run.
- Upstream financial inputs are stale.

Actions:

1. Verify `GET /api/cron/margin-guard-snapshots` is succeeding in Production.
2. Confirm the tenant has current upstream financial data.
3. Compare current summary output with recent alert and opportunity timestamps.

### 4.2 Export fails or returns 413

Likely causes:

- The tenant lacks `csv_export` or `marginguard_core`.
- The requested dataset exceeds the row-count safety ceiling.

Actions:

1. Confirm the tenant's plan entitlements.
2. Retry with a narrower dataset or period.
3. Use the dashboard to confirm whether the export scope is unexpectedly large.

### 4.3 Alerts or opportunities do not match current customer classifications

Likely causes:

- The current classifications were refreshed after the last alert sweep.
- The alert references a prior snapshot or prior threshold configuration.

Actions:

1. Compare current classification output with the alert's backing period.
2. Check recent target or settings changes.
3. Treat the discrepancy as a refresh-order issue before escalating it as a classification bug.