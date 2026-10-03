# Proposal

## Why

PaidSoon's due reminders, accounting syncs, and related scheduled workflows need durable
per-item claiming, retries, and recovery rather than relying on a single daily Vercel batch.
Railway Celery Beat and workers are already operating against both Preview and Production;
this change formalizes Railway as the scheduler and completes the approved direct cutover.

## What Changes

- **BREAKING — scheduler ownership:** make Railway Celery Beat the sole scheduled-work owner
  for supported workflows in Preview and Production. Remove the `send-emails` and
  `sync-accounting` schedules from `vercel.json`; retain their `CRON_SECRET`-protected handlers
  for controlled rollback and OAuth-state housekeeping.
- Use Postgres-backed `scheduled_task_claims` for atomic dispatch, idempotency, task lifecycle,
  bounded retries, and recovery of stale work. Redis is only the transient Celery broker.
- Delegate worker jobs to authenticated Next.js internal routes so existing TypeScript business
  rules remain authoritative for reminder delivery, accounting sync, catch-up/snooze and
  promise/arrangement sweeps, and implemented scheduled email features such as weekly debtor
  summaries and Owner's Digest.
- Keep Vercel as the dashboard, API and webhook host, and retain the independent daily
  scheduling-watchdog cron plus unrelated maintenance crons. Existing accounting “sync now”
  actions continue to enqueue through Railway when configured, with their documented inline
  fallback when it is not.
- Cut over directly, without a same-database Vercel/Railway parallel burn-in. The legacy Vercel
  routes do not acquire the worker's atomic claim, so concurrent scheduling could duplicate
  side effects. Deploy the schedule removal and verify both entries are absent from Vercel
  Production; monitor Railway heartbeat, claims, `EmailLog`, and `AccountingSyncRun` after
  cutover. This direct cutover was explicitly approved by the operator on 2026-10-03; parity
  from a dual-scheduler burn-in is not claimed.
- **Out of scope:** inventing new scheduled product features (including large report generation)
  or adding a per-invoice “send reminder now” dashboard UI; changing reminder/sync business
  rules; removing the protected legacy route handlers.

## Capabilities

### New Capabilities

- `scheduled-job-orchestration`: Durable atomic claims, task lifecycle, retries and recovery for
  supported Railway-scheduled workflows; Redis is not the durable business-state store.
- `scheduled-job-health-monitoring`: The independent Vercel Cron watchdog that alerts when the
  Railway Beat heartbeat is stale or missing.

### Modified Capabilities

- (none — no existing `openspec/specs/` capability currently governs cron/scheduling
  behavior; the current single-shot Vercel Cron behavior is undocumented as a formal spec)

## Impact

- **Runtime/configuration**: `worker/` (Celery app, dispatchers and tasks), Railway worker/Beat/
  trigger services, Redis, `vercel.json`, and the independent watchdog cron.
- **Application interfaces**: authenticated `app/api/internal/jobs/**` routes and existing
  TypeScript services for invoice reminders, accounting sync and scheduled email workflows;
  legacy cron handlers remain available but are unscheduled.
- **Durable state/security**: Supabase tables for claims and Beat heartbeats, matching schema/RLS
  definitions, and a trusted worker DB role scoped to these cross-tenant jobs. Internal HTTP
  calls use server-only shared secrets; do not expose them to clients or logs.
- **Operations**: document Railway/Vercel environment configuration and rollback in
  `docs/runbooks/**`, `docs/DDD.md`, and `docs/HLD.md`. Direct cutover has no dual-run parity
  evidence; deployment verification and post-cutover monitoring are explicit acceptance work.
- **New runtime/dependency**: Python/Celery is an intentional additional runtime alongside the
  Next.js/TypeScript app.
