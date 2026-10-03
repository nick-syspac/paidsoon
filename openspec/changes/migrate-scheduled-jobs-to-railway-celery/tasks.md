## 1. Infrastructure Setup

- [x] 1.1 Create the Railway project with a Redis instance, one Celery worker service, and one
      Celery Beat service (decide Railway-managed Redis vs. external provider first — see
      design.md Open Questions)
      — user confirmed Railway Beat is running in both Preview (`paidsoon-dev`) and Production (`paidsoon-prod`) (2026-10-03).
      `worker/README.md` has the exact deploy steps for the scaffolding below.
- [x] 1.2 Scaffold the new Python worker codebase (independent deployable, own dependency
      manifest, own DB client) as its own top-level directory, not inside the Next.js app
      — `worker/` (Celery app, dispatcher, tasks, FastAPI trigger server, `requirements.txt`,
      `railway.toml`, `Procfile`, `README.md`, pure-logic tests)
- [x] 1.3 Configure the worker's Supabase Postgres connection (trusted/admin role, same
      posture as `prismaAdmin`) and document the RLS-bypass rationale in code and in
      `docs/runbooks/README.md` — `worker/paidsoon_worker/db.py`, `worker/.env.example`
- [x] 1.4 Add new environment variables/secrets (Redis URL, Railway service credentials, any
      shared secret for Vercel→Railway "trigger now" calls) to Railway's secret store and to
      `docs/runbooks/README.md`
      — docs/env matrix updated; operator confirmed Railway trigger service and matching
      Vercel/Railway trigger credentials are configured in both environments (2026-10-03).

## 2. Database Schema Changes

- [x] 2.1 Add Supabase columns/table for task status (`queued`/`started`/`sent`/`failed`/
      `retrying`/`processing`) and claim keys, with a unique constraint enforcing the
      idempotent claim key (e.g. `invoice_id + reminder_stage + scheduled_date`)
- [x] 2.2 Add a dispatcher heartbeat table/column for the health-monitoring watchdog
- [x] 2.3 Update `prisma/schema.prisma` to reflect the new tables/columns and generate a
      migration (`npx prisma migrate dev --name add-scheduled-job-orchestration`)
- [x] 2.4 Add matching RLS policies for any new tables in `prisma/rls-policies.sql` and verify
      with `npm run verify-rls`

## 3. Dispatcher and Core Orchestration (scheduled-job-orchestration)

- [x] 3.1 Implement the Celery Beat dispatcher task that atomically claims due rows (`next_
      action_at <= now()`) via a conditional `UPDATE ... RETURNING`
      — `worker/paidsoon_worker/db.py` (`claim_due_reminder_emails`, `claim_due_accounting_connections`,
      `claim_sweep_run`, `FOR UPDATE SKIP LOCKED` + `ON CONFLICT (claim_key) DO NOTHING`),
      `worker/paidsoon_worker/dispatcher.py`
- [x] 3.2 Implement task status lifecycle transitions (`queued` → `started` → terminal state)
      persisted in Postgres for every claimed unit of work
      — `worker/paidsoon_worker/db.py` (`mark_started`/`mark_processing`/`mark_sent`/
      `mark_failed`/`mark_retrying`), `worker/paidsoon_worker/tasks.py` (`ClaimTrackingTask`)
- [x] 3.3 Implement automatic retry with exponential backoff for provider-calling tasks
      (Xero, MYOB, Resend), bounded to a maximum attempt count
      — `worker/paidsoon_worker/tasks.py` (`autoretry_for`/`retry_backoff`/`retry_backoff_max`/
      `retry_jitter`/`max_retries` on every per-item task)
- [x] 3.4 Implement the stale-`processing` recovery sweep that reclaims work stuck past the
      expected processing window, respecting the idempotent claim key
      — `worker/paidsoon_worker/db.py` (`recover_stale_processing`),
      `worker/paidsoon_worker/dispatcher.py` (`recovery_sweep`)
- [x] 3.5 Confirm and document that exactly one Celery Beat instance is deployed/running
      — documented in `worker/railway.toml`, `worker/README.md`, `worker/celery_app.py` comment;
      actual single-instance deployment happens at Railway deploy time (task 1.1)

## 4. Migrate Reminder Emails (first workflow)

- [x] 4.1 Implement a Celery task that performs the same work as
      `app/api/cron/send-emails/route.ts`'s per-invoice send logic (reusing/porting
      `computeNextEmailAt`, the three-stage gating rules, and the `EmailLog` idempotency check)
      — split as designed: `lib/email/sendReminderForInvoice.ts` (per-invoice TS logic, reused
      by the internal route) + `app/api/internal/jobs/send-reminder/route.ts` (calls it) +
      `worker/paidsoon_worker/tasks.py` (`send_reminder_task`, calls the route)
- [x] 4.2 Wire the dispatcher to enqueue this task for invoices with `nextEmailAt <= now()`
      using the new claim-key table — `worker/paidsoon_worker/dispatcher.py`
      (`dispatch_reminder_emails`)
- [x] 4.3 Decide whether to run this Celery task in parallel with the existing Vercel Cron job
      for a burn-in period; compare `EmailLog` output between both paths for duplicates/gaps
      — dual-scheduler burn-in explicitly waived by the operator (2026-10-03). The Vercel route
      does not use the worker's atomic claim table, so direct exclusive cutover was chosen to
      avoid unsafe same-database concurrency; parity is not claimed.
- [x] 4.4 Add a "trigger now" path from the dashboard that enqueues an immediate Celery task
      instead of running inline on Vercel
      — backend capability implemented (`worker/paidsoon_worker/http_server.py`
      `POST /trigger/send-reminder`), but there is no existing per-invoice "send reminder now"
      UI/route in the dashboard to wire it to. Scope this new UI feature out of the migration;
      track it separately if requested.

## 5. Migrate Accounting Sync (second workflow)

- [x] 5.1 Implement a Celery task that performs the same work as
      `syncAllActiveConnections()` per-connection, with retry/backoff for Xero/MYOB failures
      — `app/api/internal/jobs/sync-connection/route.ts` (calls the existing `syncConnection`),
      `worker/paidsoon_worker/tasks.py` (`sync_connection_task`, retry/backoff via Celery)
- [x] 5.2 Wire the dispatcher to enqueue this task per active `AccountingConnection` on its due
      schedule — `worker/paidsoon_worker/db.py` (`claim_due_accounting_connections`),
      `worker/paidsoon_worker/dispatcher.py` (`dispatch_accounting_sync`)
- [x] 5.3 Decide whether to run in parallel with `/api/cron/sync-accounting` for a burn-in
      period; compare `AccountingSyncRun` output between both paths
      — dual-scheduler burn-in explicitly waived by the operator (2026-10-03). The Vercel route
      does not use the worker's atomic claim table, so direct exclusive cutover was chosen to
      avoid unsafe same-database concurrency; parity is not claimed.
- [x] 5.4 Add a "sync now" path from the dashboard that enqueues an immediate Celery task
      instead of running inline on Vercel
      — `lib/providers/accounting/triggerSyncNow.ts`, wired into the existing
      `app/api/integrations/xero/sync/route.ts` and `.../myob/sync/route.ts`. Falls back to
      today's inline `syncConnection` call when `RAILWAY_WORKER_URL`/`WORKER_TRIGGER_SECRET`
      are unset, so this is a no-op until Railway is actually deployed and configured

## 6. Migrate Remaining Workflows

- [x] 6.1 Migrate promise-to-pay follow-up detection (broken-promise notifications) from
      `app/api/cron/send-emails/route.ts` to a Celery task
      — extracted to `lib/email/breachSweep.ts` (`runPromiseAndArrangementBreachSweep`), exposed
      via `app/api/internal/jobs/promise-arrangement-sweep/route.ts`, run as a whole-run sweep
      task (not per-item — see design.md) by `worker/paidsoon_worker/tasks.py`
      (`promise_arrangement_sweep_task`) + `dispatcher.py` (`dispatch_promise_arrangement_sweep`).
      The original Vercel cron route now calls the same shared function — no behavior change.
- [x] 6.2 Migrate arrangement breach/expiry detection to a Celery task
      — same shared sweep function/task as 6.1 (both were one combined step in the original
      cron route)
- [x] 6.3 Migrate weekly debtor summaries to a Celery task (confirm current implementation
      location, or build net-new if this doesn't exist yet)
      — implemented: `worker/paidsoon_worker/celery_app.py` schedules the weekly dispatcher;
      `dispatcher.py` claims tenants idempotently; `tasks.py` calls the authenticated
      `app/api/internal/jobs/send-weekly-debtor-summary` route, which delegates to
      `lib/email/sendWeeklyDebtorSummary.ts`. Pure summary/email/week-boundary logic is covered
      by `tests/weekly-debtor-summary.test.ts`.
- [x] 6.4 Migrate integration retry processing to rely on the new task-level retry/backoff
      instead of any existing ad-hoc retry logic
      — Celery's `autoretry_for`/`retry_backoff` on `sync_connection_task` (task 3.3) is the new
      task-level retry layer for whole-task (minutes-scale) failures. The existing in-call
      helpers (`withRetry`, `withTokenPropagationRetry` in `lib/providers/accounting/sync.ts`)
      remain unchanged — they handle fast, sub-request retries (e.g. MYOB token propagation)
      and are complementary, not superseded
- [x] 6.5 Confirm large report generation is in scope (see design.md Open Questions) before
      building a task for it; scope out if no report-generation feature exists yet
      — confirmed with the user: scoped out. No report-generation feature exists in the
      codebase; not built as part of this change

## 7. Health Monitoring (scheduled-job-health-monitoring)

- [x] 7.1 Implement dispatcher heartbeat recording at the end of every Celery Beat dispatch
      cycle — `worker/paidsoon_worker/db.py` (`write_heartbeat`), `dispatcher.py`
      (`write_heartbeat` task, scheduled in `celery_app.py`)
- [x] 7.2 Implement the Vercel watchdog cron route (low-frequency, e.g. every 15–30 minutes)
      that checks heartbeat staleness and raises an alert
      — `app/api/cron/scheduling-watchdog/route.ts`. **Constraint found during implementation:**
      Vercel Hobby plan caps cron frequency at once daily, so this runs daily rather than every
      15–30 minutes (see design.md Decisions/Open Questions) — up to ~24h detection latency
      until/unless the project upgrades to Vercel Pro
- [x] 7.3 Add the watchdog cron entry to `vercel.json` — `0 12 * * *`
- [x] 7.4 Decide and implement the alert channel (see design.md Open Questions)
      — decided with the user: email via Resend (`OPS_ALERT_EMAIL`), same direct-`Resend`
      pattern as `app/api/admin/staff/invitations/route.ts`

## 8. Cutover and Cleanup

- [x] 8.1 Obtain explicit cutover decision and designate one scheduler owner per database
      — operator approved direct Railway cutover in lieu of dual-scheduler parity burn-in
      (2026-10-03). This is not a claim that parity was measured.
- [x] 8.2 Remove the `send-emails` and `sync-accounting` cron entries from `vercel.json`
      — removed from source config. A Vercel Production deployment is still required before
      the deployed schedule changes; verify both entries are absent in Vercel Cron Jobs.
- [x] 8.3 Retain `app/api/cron/send-emails/route.ts` and
      `app/api/cron/sync-accounting/route.ts` as `CRON_SECRET`-protected manual rollback routes
      — intentionally retained rather than deleted: the sync route also cleans expired OAuth
      state, and keeping both routes enables a controlled rollback. They are no longer scheduled
      by `vercel.json`; pause Railway Beat before invoking them for rollback.
- [ ] 8.6 Deploy the Vercel configuration and verify `send-emails` and `sync-accounting` are
      absent from Production's Cron Jobs settings
      — source config is updated, but deployment/console verification requires the operator's
      Vercel access. Do not treat source removal alone as confirmation that the active Vercel
      schedules have stopped.
- [x] 8.4 Update `docs/DDD.md` and `docs/HLD.md` with the new Railway worker architecture
      — updated to document the operator-confirmed Railway deployment, direct cutover decision,
      and pending Vercel deployment verification without claiming parity
- [x] 8.5 Update `docs/runbooks/README.md` with the full environment variable matrix for the
      new Railway/Redis infrastructure
      — added `INTERNAL_JOBS_SECRET`, `RAILWAY_WORKER_URL`, `WORKER_TRIGGER_SECRET`,
      `OPS_ALERT_EMAIL` rows; worker-internal vars (`REDIS_URL`, worker's own `DATABASE_URL`,
      `DISPATCHER_NAME` etc.) documented in `worker/.env.example` since they're Railway-side,
      not Vercel env vars
