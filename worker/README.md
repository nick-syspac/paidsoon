# PaidSoon Railway Celery Worker

Background-processing service for PaidSoon's scheduled business workflows
(accounting sync, reminder emails, promise-to-pay follow-ups, weekly debtor
summaries). See
[openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md](../openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md)
for the architecture.

This service owns *dispatching, queueing, retry/backoff, and status
tracking*. The actual business logic (email templates, Xero/MYOB sync,
chase-volume gating, etc.) stays in the Next.js app and is invoked per item
via the `app/api/internal/jobs/*` routes — this avoids maintaining two
implementations of the same business rules in two languages.

## Local setup

```bash
cd worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in real values
```

## Beat schedule

Each entry in `paidsoon_worker/celery_app.py`'s `beat_schedule` reads its own env var (see
`.env.example`), defaulting to `DISPATCH_INTERVAL_SECONDS` (default `120`s) when unset:

| Beat entry | Env var | Default |
|---|---|---|
| `dispatch-reminder-emails` | `DISPATCH_REMINDER_INTERVAL_SECONDS` | `DISPATCH_INTERVAL_SECONDS` |
| `dispatch-accounting-sync` | `DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS` | `DISPATCH_INTERVAL_SECONDS` |
| `dispatch-catchup-and-snooze-sweep` | `DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS` | `DISPATCH_INTERVAL_SECONDS` |
| `dispatch-promise-arrangement-sweep` | `DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS` | `DISPATCH_INTERVAL_SECONDS` |
| `dispatch-weekly-debtor-summary` | weekly cron (`crontab(minute=0, hour=9, day_of_week="mon")`) | fixed Monday 09:00 UTC |
| `recovery-sweep` | `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS` | `DISPATCH_INTERVAL_SECONDS`, floored at 300s |
| `write-heartbeat` | `DISPATCH_INTERVAL_SECONDS` directly (not per-task — this is the Beat-liveness signal the Vercel watchdog checks) | `120` |

`DISPATCH_INTERVAL_SECONDS` must be set to the same value on the Vercel project as on this
worker — the watchdog (`app/api/cron/scheduling-watchdog/route.ts`) computes its staleness
threshold from it. See `docs/runbooks/README.md`'s env matrix.

Run each process in its own terminal (matches `Procfile`):

```bash
celery -A paidsoon_worker.celery_app worker --loglevel=info
celery -A paidsoon_worker.celery_app beat --loglevel=info
uvicorn paidsoon_worker.http_server:app --reload
```

## Deploying to Railway

You'll need your own Railway account/CLI login for this part — it isn't
something that can be provisioned for you:

1. `railway login` (opens a browser to authenticate).
2. `railway init` from this `worker/` directory (or connect this repo/subdirectory
   in the Railway dashboard).
3. Add a Redis plugin/service in the same Railway project.
4. Create **three services** from this same source, one per `Procfile`
   process type, by overriding each service's start command:
   - `celery -A paidsoon_worker.celery_app worker --loglevel=info --concurrency=4`
   - `celery -A paidsoon_worker.celery_app beat --loglevel=info` — **deploy exactly one instance**
   - `uvicorn paidsoon_worker.http_server:app --host 0.0.0.0 --port $PORT`
5. Set the environment variables from `.env.example` on all three services
   (Railway → each service → Variables). `REDIS_URL` can reference the Redis
   plugin's internal URL directly.
6. Set matching `INTERNAL_JOBS_SECRET` and `WORKER_TRIGGER_SECRET` values on
   the Vercel project (`vercel env add`) — these must be identical on both
   sides.
7. If `PAIDSOON_APP_URL` points at a Vercel deployment with Deployment
   Protection (Vercel Authentication) enabled — e.g. a protected `dev.*`
   domain — generate a bypass secret in Vercel: Project Settings →
   Deployment Protection → Protection Bypass for Automation. Set the same
   value as `VERCEL_AUTOMATION_BYPASS_SECRET` on all three Railway services.
   Without it, every internal-jobs call gets a 401 with a Vercel SSO
   redirect page instead of reaching the route handler.
7. Watch logs (`railway logs`) for the first few dispatch cycles before
   relying on it; keep the existing Vercel Cron jobs running in parallel
   during burn-in (see design.md Migration Plan).

## Tests

Pure-logic tests (claim-key shape, no DB/network) live in `tests/` and run
with the standard library `unittest`, matching the main repo's convention of
testing pure logic without live infrastructure:

```bash
python3 -m unittest discover -s tests
```
