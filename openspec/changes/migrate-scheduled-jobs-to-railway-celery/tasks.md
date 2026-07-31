## 1. Infrastructure Setup

- [ ] 1.1 Create the Railway project with a Redis instance, one Celery worker service, and one
      Celery Beat service (decide Railway-managed Redis vs. external provider first — see
      design.md Open Questions)
      — **requires your own Railway account/CLI login; cannot be done from this environment.**
      `worker/README.md` has the exact deploy steps for the scaffolding below.
- [x] 1.2 Scaffold the new Python worker codebase (independent deployable, own dependency
      manifest, own DB client) as its own top-level directory, not inside the Next.js app
      — `worker/` (Celery app, dispatcher, tasks, FastAPI trigger server, `requirements.txt`,
      `railway.toml`, `Procfile`, `README.md`, pure-logic tests)
- [x] 1.3 Configure the worker's Supabase Postgres connection (trusted/admin role, same
      posture as `prismaAdmin`) and document the RLS-bypass rationale in code and in
      `docs/runbooks/README.md` — `worker/paidsoon_worker/db.py`, `worker/.env.example`
- [ ] 1.4 Add new environment variables/secrets (Redis URL, Railway service credentials, any
      shared secret for Vercel→Railway "trigger now" calls) to Railway's secret store and to
      `docs/runbooks/README.md`
      — docs done (README.md env matrix updated with `INTERNAL_JOBS_SECRET`,
      `RAILWAY_WORKER_URL`, `WORKER_TRIGGER_SECRET`, `OPS_ALERT_EMAIL`); actually setting real
      secret values in Railway's dashboard/CLI requires your own account (see 1.1)

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
- [ ] 4.3 Run this Celery task in parallel with the existing Vercel Cron job for the agreed
      burn-in period; compare `EmailLog` output between both paths for duplicates/gaps
      — operational step; requires Railway actually deployed (task 1.1) and running for
      several days
- [ ] 4.4 Add a "trigger now" path from the dashboard that enqueues an immediate Celery task
      instead of running inline on Vercel
      — backend capability implemented (`worker/paidsoon_worker/http_server.py`
      `POST /trigger/send-reminder`), but there is no existing per-invoice "send reminder now"
      UI/route in the dashboard to wire it to (confirmed: none exists today) — building that UI
      is a new feature beyond this migration's scope, left for a follow-up change

## 5. Migrate Accounting Sync (second workflow)

- [x] 5.1 Implement a Celery task that performs the same work as
      `syncAllActiveConnections()` per-connection, with retry/backoff for Xero/MYOB failures
      — `app/api/internal/jobs/sync-connection/route.ts` (calls the existing `syncConnection`),
      `worker/paidsoon_worker/tasks.py` (`sync_connection_task`, retry/backoff via Celery)
- [x] 5.2 Wire the dispatcher to enqueue this task per active `AccountingConnection` on its due
      schedule — `worker/paidsoon_worker/db.py` (`claim_due_accounting_connections`),
      `worker/paidsoon_worker/dispatcher.py` (`dispatch_accounting_sync`)
- [ ] 5.3 Run in parallel with `/api/cron/sync-accounting` for the agreed burn-in period;
      compare `AccountingSyncRun` output between both paths
      — operational step; requires Railway actually deployed (task 1.1) and running for
      several days
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
- [ ] 6.3 Migrate weekly debtor summaries to a Celery task (confirm current implementation
      location, or build net-new if this doesn't exist yet)
      — confirmed: no weekly-debtor-summary feature exists anywhere in the codebase today.
      There is nothing to migrate; building this from scratch is a new feature and out of
      scope for this migration change
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

- [ ] 8.1 Confirm burn-in parity (no duplicate sends/syncs, no missed due work) for every
      migrated workflow
      — operational step; requires Railway actually deployed and running in production
      alongside the existing Vercel crons for the agreed burn-in period. Intentionally not
      done yet — see design.md Migration Plan
- [ ] 8.2 Remove the `send-emails` and `sync-accounting` cron entries from `vercel.json`
      — intentionally NOT done: must only happen after 8.1 confirms parity in production
- [ ] 8.3 Remove or archive `app/api/cron/send-emails/route.ts` and
      `app/api/cron/sync-accounting/route.ts` once Railway is the sole owner
      — intentionally NOT done, same reason as 8.2 (both routes now share their sweep/breach
      logic with the Celery path via `lib/email/breachSweep.ts`, so removing them later is a
      simple deletion, not a behavior change)
- [x] 8.4 Update `docs/DDD.md` and `docs/HLD.md` with the new Railway worker architecture
      — updated (infra runtime tables, new internal API routes, scheduler row) to describe the
      migration as in-progress/not-yet-deployed, per "never document planned integrations as
      implemented"
- [x] 8.5 Update `docs/runbooks/README.md` with the full environment variable matrix for the
      new Railway/Redis infrastructure
      — added `INTERNAL_JOBS_SECRET`, `RAILWAY_WORKER_URL`, `WORKER_TRIGGER_SECRET`,
      `OPS_ALERT_EMAIL` rows; worker-internal vars (`REDIS_URL`, worker's own `DATABASE_URL`,
      `DISPATCHER_NAME` etc.) documented in `worker/.env.example` since they're Railway-side,
      not Vercel env vars
