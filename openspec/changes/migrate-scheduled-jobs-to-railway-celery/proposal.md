## Why

PaidSoon's scheduled business workflows (Xero/MYOB sync, overdue-invoice detection, the
three-stage reminder sequence, promise-to-pay follow-ups) currently run as two Vercel Cron
jobs (`/api/cron/send-emails`, `/api/cron/sync-accounting`) that invoke ordinary Vercel
Functions once a day. This gives PaidSoon no queueing, no per-task retry/backoff, no
controlled concurrency, and no durable "claim" semantics — a slow provider or a function
timeout can leave a whole day's run half-finished with no recovery path other than waiting
for the next scheduled invocation. As invoice volume and the number of scheduled workflows
(sync, reminders, promise follow-ups, weekly debtor summaries, reconciliation, reports) grow,
this single-shot batch model becomes the primary reliability risk in the product. Railway
Celery + Celery Beat + Redis is purpose-built for this shape of problem (durable queues,
per-task retry with exponential backoff, idempotent claiming) and is the architecture Railway
itself recommends for exactly this kind of background-processing workload.

## What Changes

- Introduce a Railway-hosted Python worker service running Celery workers + a single Celery
  Beat instance, backed by Redis as the broker/queue.
- Add a lightweight dispatcher task (run by Celery Beat every 1–5 minutes) that atomically
  claims Supabase rows whose `next_action_at` is due and enqueues one Celery task per
  invoice/reminder — replacing the current "iterate everything once a day" batch loop.
- **BREAKING**: Move ownership of these scheduled workflows off Vercel Cron and onto Railway
  Celery: Xero/MYOB sync, overdue-invoice detection, three-stage reminder emails,
  promise-to-pay follow-ups, weekly debtor summaries, integration retry processing,
  reconciliation/stale-job recovery, and large report generation.
- Add task-level idempotency: a unique claim key per unit of work (e.g.
  `invoice_id + reminder_stage + scheduled_date`), a `queued`/`started`/`sent`/`failed`/
  `retrying`/`processing` status column set, and a recovery sweep that reclaims tasks stuck in
  `processing` after a worker crash.
- Add automatic retry with exponential backoff for Xero, MYOB, and Resend (email-provider)
  failures at the task level, replacing today's single-attempt-per-day behavior.
- Keep Vercel for the dashboard, all authenticated API routes, webhook receipt/validation, and
  user-triggered "sync now" actions (these enqueue a Celery task immediately rather than doing
  the work inline).
- Add one independent, low-frequency Vercel Cron watchdog that alerts if Railway/Celery Beat
  has stopped dispatching (Railway scheduling health check).
- Run Railway Celery in parallel with the existing Vercel Cron jobs for a burn-in period,
  then **BREAKING**: remove `send-emails` and `sync-accounting` from `vercel.json` once parity
  is confirmed.
- Supabase remains the single source of truth for invoice/reminder/sync state; Celery only
  reads/claims/writes rows there (no new datastore for business data — Redis holds only
  transient queue/broker state).

## Capabilities

### New Capabilities
- `scheduled-job-orchestration`: The Celery Beat dispatcher + Redis queue + claim/idempotency/
  retry/recovery contract that all scheduled business workflows (invoice sync, reminder
  emails, promise follow-ups, debtor summaries, reconciliation, report generation) run under —
  including the `queued`/`started`/`sent`/`failed`/`retrying`/`processing` status lifecycle,
  the atomic due-work claim, per-task exponential backoff, and the stale-`processing` recovery
  sweep.
- `scheduled-job-health-monitoring`: The independent, low-frequency Vercel Cron watchdog that
  detects and alerts when Railway/Celery Beat scheduling has stopped running, so a Railway
  outage isn't silently invisible.

### Modified Capabilities
- (none — no existing `openspec/specs/` capability currently governs cron/scheduling
  behavior; the current single-shot Vercel Cron behavior is undocumented as a formal spec)

## Impact

- **Affected code**: `app/api/cron/send-emails/route.ts`, `app/api/cron/sync-accounting/route.ts`,
  `vercel.json` (cron entries), `lib/email/schedule.ts`, `lib/providers/accounting/sync.ts`,
  `lib/arrangements.ts`, `lib/promiseEscalationPolicy.ts` — all move from "iterate everything
  inline" to "enqueue one task per unit of work" callers.
- **New infrastructure**: Railway project (Celery worker + Celery Beat services), Redis
  instance (Railway-managed or Upstash), a new Python codebase/package for the worker service.
- **Database**: new columns/tables in Supabase for per-task status (`queued`/`started`/`sent`/
  `failed`/`retrying`/`processing`), claim keys, and `next_action_at` scheduling fields on the
  relevant models (`TrackedInvoice`, `Arrangement`/promise follow-ups, accounting sync runs).
  RLS policies must be updated for any new tables (`prisma/rls-policies.sql`), and the worker
  connects as a trusted/admin role (bypassing RLS the same way `prismaAdmin`/the cron routes do
  today), since it acts on behalf of all tenants.
- **New environment variables/secrets**: Redis connection URL, Railway service credentials, a
  shared secret for any Vercel→Railway "trigger now" call, documented in
  `docs/runbooks/README.md`.
- **Dependencies**: introduces Python and Celery to the stack for the first time — a
  deliberate, explicit new-provider decision (per repo convention, documented here rather than
  added silently).
- **Docs**: `docs/DDD.md`, `docs/HLD.md`, and `docs/runbooks/README.md` need new sections
  describing the Railway worker architecture, deployment, and environment variables.
