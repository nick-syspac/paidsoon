## 1. Worker config — new per-task interval settings

- [x] 1.1 Add `DISPATCH_REMINDER_INTERVAL_SECONDS`, `DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS`,
      `DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS`, `DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS`,
      `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS` to `worker/paidsoon_worker/config.py`, each
      defaulting to `DISPATCH_INTERVAL_SECONDS`'s resolved value when unset
- [x] 1.2 Keep the recovery-sweep floor: `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS` value used by
      Beat is still `max(configured value, 300)`
- [x] 1.3 Add a one-line comment on `DISPATCH_INTERVAL_SECONDS` in `config.py` noting it now
      drives `write-heartbeat` only (and the five new vars' defaults)

## 2. Wire Beat schedule to the new per-task settings

- [x] 2.1 Update `worker/paidsoon_worker/celery_app.py`'s `app.conf.beat_schedule` so each of the
      five dispatcher entries reads its own new config value instead of the shared
      `DISPATCH_INTERVAL_SECONDS`
- [x] 2.2 Leave `write-heartbeat`'s schedule reading `Config.DISPATCH_INTERVAL_SECONDS` directly
      (unchanged)
- [x] 2.3 Run the worker's existing test suite (`python -m unittest discover -s tests`) to confirm
      no regression

## 3. Vercel watchdog — computed threshold

- [x] 3.1 Add `STALE_THRESHOLD_MULTIPLIER` handling and a `DISPATCH_INTERVAL_SECONDS` read (both
      via `process.env`, both optional with defaults reproducing today's 20-minute threshold) to
      `app/api/cron/scheduling-watchdog/route.ts`
- [x] 3.2 Replace the hardcoded `STALE_THRESHOLD_MINUTES = 20` constant with a computed value:
      `(DISPATCH_INTERVAL_SECONDS seconds) × STALE_THRESHOLD_MULTIPLIER`
- [x] 3.3 Confirm the default computation equals the previous hardcoded 20 minutes exactly, so no
      behavior changes for a deployment that sets neither new var

## 4. Documentation

- [x] 4.1 Add all previously-undocumented worker env vars (`DISPATCH_INTERVAL_SECONDS`,
      `STALE_PROCESSING_THRESHOLD_SECONDS`, `MAX_TASK_RETRIES`, `RETRY_BACKOFF_BASE_SECONDS`) plus
      the five new per-task interval vars to `worker/.env.example`
- [x] 4.2 Update `worker/README.md` with a table listing all six Beat schedule entries, their env
      var, and default value
- [x] 4.3 Add the Vercel-side vars from this change (`STALE_THRESHOLD_MULTIPLIER` and the
      Vercel-side `DISPATCH_INTERVAL_SECONDS`) to `docs/runbooks/README.md`'s env var matrix.
      Scope note: the worker-only vars (per-task intervals, retry/backoff settings) are NOT
      duplicated into this matrix — it documents Vercel/Next.js `process.env` reads only (its
      own stated scope); they remain documented solely in `worker/.env.example` /
      `worker/README.md`, consistent with existing rows like `RAILWAY_WORKER_URL`.
- [x] 4.4 Note in `docs/runbooks/README.md` that `DISPATCH_INTERVAL_SECONDS` must be set to the
      same value in both the Railway worker and the Vercel project

## 5. Deployment

- [ ] 5.1 Deploy the worker change first (fully backward compatible, no new required vars) and
      confirm Beat logs show unchanged effective cadence
- [ ] 5.2 Add `DISPATCH_INTERVAL_SECONDS` and `STALE_THRESHOLD_MULTIPLIER` to the Vercel project
      env (values reproducing today's 20-minute threshold) and deploy the watchdog route change
- [ ] 5.3 Trigger `scheduling-watchdog` and confirm its response/logs show the expected computed
      threshold
