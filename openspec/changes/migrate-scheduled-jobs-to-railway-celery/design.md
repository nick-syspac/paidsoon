## Context

PaidSoon's only scheduled processing today is two Vercel Cron jobs, both authenticated with
`Authorization: Bearer CRON_SECRET` and both running as ordinary Vercel Functions on a fixed
daily schedule (`vercel.json`):

- `/api/cron/send-emails` (09:00 UTC) — runs `runCatchUpScan()`, resumes snoozed invoices,
  detects broken promises/arrangements, then iterates every eligible `TrackedInvoice` in a
  single request and sends the next reminder stage via `sendFollowUpEmail` /
  `sendP2PNotification`, using `prismaAdmin` (RLS bypass, intentional per
  `email-automation.instructions.md`).
- `/api/cron/sync-accounting` (02:00 UTC, `maxDuration = 60`) — calls
  `syncAllActiveConnections()`, which loops every active `AccountingConnection` sequentially
  against Xero/MYOB.

Both jobs run once per day, all-or-nothing per invocation, with no per-item retry/backoff,
no queue, and no durable claim — a slow provider call or a function timeout mid-run simply
leaves that day's remaining work undone until the next scheduled invocation. Relevant existing
models: `TrackedInvoice` (status, `nextEmailAt`, `currentStage`, `snoozedUntil`), `EmailLog`
(idempotency check on `(trackedInvoiceId, stage)`), `Arrangement` /
`ArrangementInvoiceCoverage`, `PromiseToPay`, `AccountingConnection` / `AccountingSyncRun`.
Supabase Postgres (via Prisma) is the sole source of truth for all of this state; RLS is
enforced everywhere except explicitly-documented `prismaAdmin` paths (cron jobs, webhooks,
signup bootstrap).

## Goals / Non-Goals

**Goals:**
- Move ownership of scheduled business workflows (accounting sync, reminder emails, promise
  follow-ups, debtor summaries, integration retries, reconciliation, report generation) to a
  Railway-hosted Celery worker + Celery Beat + Redis stack, dispatched every 1–5 minutes
  instead of once a day.
- Make every unit of scheduled work idempotent and safely re-runnable via a unique claim key
  and an explicit status lifecycle (`queued`/`started`/`sent`/`failed`/`retrying`/`processing`).
- Add per-task automatic retry with exponential backoff for Xero, MYOB, and Resend failures.
- Add a recovery sweep that reclaims work stuck in `processing` after a worker crash.
- Keep Supabase Postgres as the single source of truth; Redis holds only transient
  broker/queue state, never durable business data.
- Preserve today's user-facing behavior exactly (three-stage timing, gating rules, chase-
  volume limits, custom-domain sending) — this change is about *where and how reliably* the
  work runs, not the business rules themselves.
- Keep Vercel as the front door for the dashboard, all authenticated API routes, webhook
  receipt/validation, and user-triggered "sync now" actions.

**Non-Goals:**
- Not changing the three-stage reminder timing/tone rules, chase-volume allowance logic, RLS
  policies for existing tables, or any Stripe/Resend/Xero/MYOB business behavior.
- Not moving the dashboard, authenticated API routes, or webhook receivers off Vercel.
- Not building a general-purpose job-scheduling product — the dispatcher is specific to
  PaidSoon's `next_action_at`-style due-work model.
- Not migrating existing historical `EmailLog`/`AccountingSyncRun` data; only new scheduling
  metadata is added going forward.
- Not implementing this proposal's "large report generation" item beyond a stub task, since no
  report-generation feature exists yet in the codebase.

## Decisions

- **Celery + Celery Beat + Redis on Railway, one Beat instance.** Railway explicitly documents
  this pattern for Django-adjacent background processing; it gives durable queues, per-task
  retry/backoff, and controlled concurrency that Vercel Functions (request/response, execution-
  time-limited) cannot provide. Alternative considered: keep everything on Vercel Cron with
  manual chunking/pagination across multiple invocations — rejected because it still lacks a
  real queue, per-item retry state, and worker concurrency control, and would require
  reinventing much of what Celery already provides.
- **Dispatcher pattern, not one Beat schedule per invoice.** A single Beat-triggered dispatcher
  task runs every 1–5 minutes, atomically claims Supabase rows where `next_action_at <= now()`
  (via a conditional `UPDATE ... WHERE ... RETURNING`, the Postgres equivalent of
  `SELECT ... FOR UPDATE SKIP LOCKED`), and enqueues one Celery task per claimed row onto
  Redis. Alternative considered: a Beat entry per invoice — rejected, since Beat schedules are
  static/config-driven and cannot scale to a per-row, dynamically-changing due time.
- **Claim key = `invoice_id + reminder_stage + scheduled_date`** (documented in the proposal),
  enforced with a unique constraint on the new status/claim table so a duplicate enqueue is a
  no-op at the database level, not just an application-level check. This replaces (and
  strengthens) today's `EmailLog (trackedInvoiceId, stage)` pre-send check, which only guards
  against sending, not against double-claiming.
- **New Postgres columns/table for task status**, not Redis, as the durable record of
  `queued`/`started`/`sent`/`failed`/`retrying`/`processing`. Redis (Celery's broker) is
  explicitly transient — if Redis is flushed or restarted, the recovery sweep must be able to
  rebuild in-flight state entirely from Postgres. Alternative considered: rely on Celery's own
  result backend for state — rejected because it couples business state to broker
  infrastructure and isn't queryable from the dashboard/admin tooling.
- **Worker connects to Supabase as a trusted/admin role**, the same posture as today's
  `prismaAdmin`/cron routes, since the dispatcher and workers act across all tenants by design.
  This must be documented explicitly per the repo's RLS-bypass convention (a code comment plus
  an entry here), not silently assumed.
- **Vercel keeps a single watchdog cron** that checks a "last dispatcher heartbeat" timestamp
  written by Celery Beat to Postgres, and alerts if it's stale. This is the one legitimate
  reason a Vercel schedule survives the migration. **Constraint discovered during
  implementation**: PaidSoon runs on the Vercel Hobby plan, which only permits cron schedules
  with a once-per-day frequency — sub-daily schedules (e.g. every 15–30 minutes, as originally
  envisioned) are not honored on this plan. The watchdog therefore runs once daily as the
  Hobby-plan-compatible interim; this means a Railway outage could go undetected for up to ~24
  hours. Tightening this to a true 15–30 minute check requires upgrading to Vercel Pro (see
  Open Questions).
- **Exclusive scheduler ownership; direct cutover approved.** A parallel burn-in is permitted
  only after both Railway and legacy Vercel paths acquire the same atomic Postgres claim before
  performing side effects. The current `/api/cron/send-emails` route queries and sends
  due invoices without consulting `scheduled_task_claims`; its `EmailLog` check is not a
  cross-process atomic claim. The current `/api/cron/sync-accounting` route likewise invokes
  `syncAllActiveConnections()` without consulting that claim table. Therefore the designed
  shared claim-key protection is not currently present in the Vercel paths, and same-database
  parallel execution is unsafe. Only one scheduler may own a given database. On 2026-10-03,
  the operator explicitly approved a direct cutover to Railway Beat instead of a burn-in;
  `send-emails` and `sync-accounting` are removed from the Vercel schedule, and their
  `CRON_SECRET`-protected routes remain available for manual rollback/housekeeping. The source
  change takes effect in Production only after a Vercel deployment, which must be followed by
  verification that both cron entries have disappeared from Vercel's Cron Jobs settings.
- **New Python codebase.** This is the first Python component in the repo. It lives as an
  independent deployable (not part of the Next.js app), communicating with Supabase Postgres
  directly (its own DB client, same `DATABASE_URL`-style pooled connection) — it does not go
  through Next.js API routes for its own scheduled work, only for the "trigger now" path
  initiated from the dashboard.

## Risks / Trade-offs

- [New language/runtime (Python) and new hosting provider (Railway) increase operational
  surface area and on-call complexity] → Mitigate with a documented burn-in/parallel-run
  period, the watchdog cron, and keeping the worker codebase small and single-purpose (no
  business logic Vercel doesn't already have a TypeScript equivalent of, at least initially).
- [A direct cutover without a parallel burn-in may expose worker/configuration defects after
  the legacy schedule is removed] → Operator accepted this risk on 2026-10-03. Confirm Railway
  Beat heartbeats and task outcomes after deployment; rollback by pausing Beat before restoring
  legacy Vercel schedules. Never run both owners concurrently against the same database because
  the legacy routes do not use the worker's atomic claim table.
- [Redis is a new piece of infrastructure holding in-flight queue state] → Treat Redis as fully
  disposable — recovery sweep must reconstruct all in-flight/stuck work from Postgres alone;
  document this explicitly and test a Redis flush/restart scenario before cutover.
- [Running an admin/trusted DB role from a new, separate service increases the blast radius of
  a credential leak] → Scope the Railway worker's DB credentials as narrowly as the current
  `prismaAdmin` usage, store them only in Railway's secret store, and document the RLS-bypass
  rationale per repo convention.
- [Team has no prior Python/Celery operational experience in this repo] → Start with the
  highest-value, lowest-risk workflow (accounting sync or reminders — whichever has clearer
  current pain) as the first migrated workflow, prove the pattern, then extend to the rest
  rather than moving everything simultaneously.

## Migration Plan

1. Stand up Railway project (Redis + one Celery worker service + one Celery Beat service);
  add new Supabase columns/table for claim keys and task status; add RLS policies for any new
  tables.
2. Implement and deploy the scheduled workflows to Railway. The operator confirmed Beat is
  running against both `paidsoon-dev` and `paidsoon-prod` and approved direct cutover on
  2026-10-03.
3. Remove `send-emails` and `sync-accounting` from `vercel.json` without a parallel burn-in;
  retain the old routes for manual rollback. Deploy the Vercel change and verify the two
  schedules are absent in the Production Cron Jobs settings. Until that deployment is
  verified, the old deployed Vercel schedules may still be active.
4. After cutover, monitor dispatcher heartbeats, `scheduled_task_claims`, `EmailLog`, and
  `AccountingSyncRun` for missed/failed work. This is post-cutover monitoring, not parity
  evidence from a dual-scheduler burn-in.
5. Keep the independent Vercel watchdog cron active.
6. **Rollback strategy**: pause the Railway Beat tasks (or scale Beat to zero) before restoring
  the Vercel `send-emails` and `sync-accounting` schedule entries and deploying. Do not enable
  both schedulers against the same database: legacy routes do not use the worker's atomic claim
  table. No schema rollback is needed; retain the additive claim/status tables.

## Open Questions

- Where does the report-generation workflow ("large report generation") actually live today?
  No report-generation feature currently exists in the codebase — confirm whether this is
  aspirational/future scope before writing tasks for it, or scope it out of this change.
- Redis hosting: Railway-managed Redis vs. an external provider (e.g. Upstash) — affects
  network path/latency between Railway workers and Redis; needs a decision before
  infrastructure setup.
- Alerting channel for the Vercel watchdog cron is email (via Resend, same pattern as
  `app/api/admin/staff/invitations/route.ts`'s direct `Resend` usage for non-follow-up
  operational email) to a new `OPS_ALERT_EMAIL` env var.
- Whether to upgrade to Vercel Pro to run the watchdog at its originally-intended 15–30 minute
  frequency (Hobby plan only allows daily schedules — see Decisions) is an open cost/tradeoff
  decision for the team, not made in this change.
- Whether the Railway worker connects to Supabase via the pooled `DATABASE_URL` (like Vercel
  runtime) or a dedicated connection path, given Celery workers are long-lived processes rather
  than short-lived serverless invocations — connection pool sizing needs its own review.
