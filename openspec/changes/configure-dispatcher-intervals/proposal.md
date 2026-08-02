## Why

The Railway Celery Beat worker (`worker/`, introduced by `migrate-scheduled-jobs-to-railway-celery`)
already reads several tuning env vars — `DISPATCH_INTERVAL_SECONDS`, `STALE_PROCESSING_THRESHOLD_SECONDS`,
`MAX_TASK_RETRIES`, `RETRY_BACKOFF_BASE_SECONDS` — but none of them are documented in
`worker/.env.example`, `worker/README.md`, or `docs/runbooks/README.md`'s env matrix, so an
operator has no discoverable way to find or safely change them. Separately, all five dispatcher
tasks (reminder emails, accounting sync, catchup/snooze sweep, promise/arrangement sweep,
recovery sweep) share one interval, blocking independent tuning of workflows with genuinely
different acceptable latency. Finally, the Vercel watchdog's staleness threshold
(`STALE_THRESHOLD_MINUTES = 20`, hardcoded in `app/api/cron/scheduling-watchdog/route.ts`) is
disconnected from the actual heartbeat cadence — if the interval is ever changed, the threshold
silently stops being "comfortably larger" and can start producing false positives or false
negatives.

## What Changes

- Document the four existing undocumented worker env vars (`DISPATCH_INTERVAL_SECONDS`,
  `STALE_PROCESSING_THRESHOLD_SECONDS`, `MAX_TASK_RETRIES`, `RETRY_BACKOFF_BASE_SECONDS`) in
  `worker/.env.example`, `worker/README.md`, and `docs/runbooks/README.md`'s env matrix.
- Add five new per-task dispatch interval env vars, one per dispatcher task
  (`DISPATCH_REMINDER_INTERVAL_SECONDS`, `DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS`,
  `DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS`, `DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS`,
  `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS`), each defaulting to `DISPATCH_INTERVAL_SECONDS`'s
  value when unset, so an existing deployment that only sets the shared var keeps behaving
  exactly as it does today.
- Narrow `DISPATCH_INTERVAL_SECONDS`'s role to drive only `write-heartbeat` going forward — it
  becomes the "is Celery Beat alive" cadence, decoupled from the five (now independently
  configurable) business dispatcher tasks.
- Add a new Vercel env var `STALE_THRESHOLD_MULTIPLIER` (default preserves today's effective
  ratio) and require `DISPATCH_INTERVAL_SECONDS` also be set in the Vercel project. The watchdog
  computes its staleness threshold as `DISPATCH_INTERVAL_SECONDS × STALE_THRESHOLD_MULTIPLIER`
  instead of the hardcoded `STALE_THRESHOLD_MINUTES = 20` constant.
- No change to business logic, reminder timing, chase-volume rules, or any user-facing behavior
  — this is scheduling-infrastructure configuration only.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `scheduled-job-orchestration`: the dispatcher's fixed "one interval for every task" schedule
  becomes five independently configurable per-task intervals; the Beat-heartbeat cadence is
  explicitly separated from business-task cadences.
- `scheduled-job-health-monitoring`: the Vercel watchdog's staleness threshold changes from a
  hardcoded constant to a value computed from the (now Vercel-visible) heartbeat interval and a
  configurable multiplier.

## Impact

- `worker/paidsoon_worker/config.py` — add five new per-task interval settings with
  `DISPATCH_INTERVAL_SECONDS`-derived defaults.
- `worker/paidsoon_worker/celery_app.py` — wire each `beat_schedule` entry to its own config
  value instead of the single shared one.
- `worker/.env.example`, `worker/README.md` — document all previously-undocumented worker env
  vars plus the five new ones.
- `docs/runbooks/README.md` — add all of the above to the canonical env var matrix, plus the new
  Vercel-side `STALE_THRESHOLD_MULTIPLIER` and the now-required Vercel copy of
  `DISPATCH_INTERVAL_SECONDS`.
- `app/api/cron/scheduling-watchdog/route.ts` — replace the hardcoded `STALE_THRESHOLD_MINUTES`
  constant with a computed value.
- Deployment: Railway worker env (5 new optional vars) and Vercel project env
  (`DISPATCH_INTERVAL_SECONDS`, `STALE_THRESHOLD_MULTIPLIER`) both need updating post-merge.
- Depends on `migrate-scheduled-jobs-to-railway-celery` (in progress, 26/35 tasks) — this change
  builds directly on its `worker/` Celery Beat implementation and its
  `scheduled-job-orchestration` / `scheduled-job-health-monitoring` capabilities.
