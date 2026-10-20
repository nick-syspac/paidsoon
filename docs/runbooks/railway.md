# Railway worker runbook

Railway hosts PaidSoon's Celery worker, Celery Beat scheduler, trigger API, and
Redis broker. This runbook covers initial provisioning, deployment, verification,
burn-in, rollback, and routine configuration.

The Railway stack is implemented in [`worker/`](../../worker) and the operator
has confirmed Beat runs in Preview and Production. Direct cutover to Railway
was approved on 2026-10-03 without a parallel burn-in because the legacy Vercel
routes do not acquire the worker's atomic claim rows. The `vercel.json` source
configuration no longer schedules reminder/accounting crons; deploy this change
and verify both entries are removed from Vercel Production's Cron Jobs. Until
then, an already-deployed Vercel schedule may still run. Never run both
schedulers against the same database.

> Environment-variable values come from the [canonical matrix](./README.md#railway-environment-variable-matrix).
> Do not put real credentials in this file or in `worker/.env.example`.

## Architecture

Create these four resources in each persistent Railway environment:

```text
Railway environment
├── Redis                   private Celery broker and result backend
├── paidsoon-worker         Celery task execution
├── paidsoon-beat           Celery scheduling; exactly one replica
└── paidsoon-trigger-web    FastAPI trigger surface; public HTTPS domain
```

The worker and Beat services connect to Redis over Railway's private network.
Only `paidsoon-trigger-web` needs a public domain. Supabase Postgres remains the
durable source of truth for claims, task status, and dispatcher heartbeats;
Redis is transient and may be rebuilt without restoring business data.

The runtime flow is:

```text
Celery Beat ──claims due work──▶ Supabase Postgres
     │
     └──enqueues──▶ Redis ──delivers──▶ Celery worker
                                         │
                                         └──authenticated request──▶ Vercel internal job route

Vercel dashboard ──authenticated request──▶ trigger web ──enqueues──▶ Redis
```

### Candidate selection is not execution authorization — trial-access rollout

CommitGuard task 6.3 extends this same owner in code only, with its release
gate disabled and no additional Beat entry active. It reuses internal-job
authentication and central execution access; Postgres work rows, not Redis or
the generic claim table, own retry/lease/fence recovery. Local tasks 6.5/6.6 now
complete operational/risk evaluation in the same fenced transaction; the old
202 dependency deferral is historical, not the current handler response.
No new environment variable or deployment is authorized. Follow the
[CommitGuard-specific contract](commitguard.md#task-63-queue-and-recovery--unmerged--not-deployed)
and [authentication, safe diagnosis and repair/retry procedures](commitguard.md#task-68-operator-procedures--unmerged--not-deployed)
before any separately reviewed activation. The Python gate does not block direct
HTTP calls; those require separate authorization too. Keep exactly one existing
Beat owner, no competing Vercel schedule or additional scheduler. SQL application
and activation remain pending; history is not mail delivery, and task 7.7 digest
event integration is still pending.

**Working-tree status, 17 October 2026:** customer display/API/limit changes
(tasks 5.1–5.5) and execution/selector changes (6.1–6.4) are present. This is
not deployment evidence. Isolated migration/CHECK/RLS verification and separately
reviewed application (3.8/3.9/9.3), owner UI (8.1–8.4), and cross-cutting
release/browser checks remain gates. Follow the
[release checklist](./vercel.md#12-trial-access-and-customer-billing-journal-release-gate);
do not enable owner management on the strength of mocked tests.

Railway owns discovery, claims, queues, retry/backoff, and task status. A queued
tenant/invoice identity is **not** an authorization snapshot. The
[worker selectors](../../worker/paidsoon_worker/db.py) claim a safe superset:

| Workflow | Candidate selection | Authoritative Next.js execution |
| --- | --- | --- |
| Weekly debtor summary | All profiles, ordered by tenant; no raw tier/status/grant filter. Existing weekly dispatcher cadence and UTC-week claim identity remain. | Fresh access plus `weekly_summary_email` before payload computation/preparation and again before sending. |
| Owner's Digest email | Joined profile with `enabled` and `email_enabled` settings; no raw billing-plan filter. Beat evaluates hourly; the existing date-only claim key is unchanged (see below). | Fresh access plus `owners_digest_core`/`owners_digest_email`; existing frequency/day/time, empty-digest, recipient, and delivery rules still apply. Cadence `now` is not an authorization clock. |
| Reminder | Existing due-invoice selection, claim identity, and account allowance locking. | Reauthorize first and underway stages at execution and in the shared sender immediately before transport; first chases additionally require available allowance. |
| Subscription-controlled financial sweeps/services | Existing operational candidates; batch access reads can exclude denied cohorts early. | Allowed batch candidates are checked afresh before feature-gated computation. Shared services and notification senders check their own applicable access/features, not an enqueued tier. |

The central [resolver](../../lib/billing/effectiveAccess.ts) and
[financial job gate](../../lib/billing/financialJobAccess.ts) remain the authority.
Do not put plan/status/grant eligibility, quota rules, or a second entitlement
matrix in Python. A broader candidate claim may legitimately finish with a skip;
it is not evidence of a missed send, nor permission to send from the worker.
Existing public/hidden-plan and implementation-readiness gates are unchanged.

Claim serialization is currently `entity:suffix:YYYY-MM-DD`: weekly summaries
use the UTC Monday date; digest selection passes an hour-start instant but
`_claim_key()` retains only its UTC date. Hourly Beat evaluation therefore does
not guarantee a new digest claim each hour or a same-day reattempt after a
terminal skip. This existing behavior is not changed by the selector update;
do not invent hourly-unique keys or a new retry cadence in this rollout.

#### Expiration, structured skips, and restoration

Grant access requires `startsAt <= serverNow < expiresAt`. Expiry at the exact
boundary, revocation, or blocking billing risk after queueing must be rechecked;
only independently valid paid/Stripe/onboarding access can continue to authorize
work. Stripe `trialing` remains authoritative even with a stale recorded date;
this is not a new Python/local Stripe-trial termination timer. Paid access and
past-due grace retain their existing billing-plan precedence/policy, with grants
suppressed for delinquency/risk rather than used as a bypass.

Expected access outcomes are structured, not provider errors:

- Reminder execution returns `{outcome: "skipped", reason: "access_denied"}`;
   the legacy cron aggregates `skipped.access_denied` rather than adding a send
   error. No send, success log, first-chase consumption, or sequence advancement
   is recorded for an access skip.
- Summary/digest senders return `{status: "skipped", reason: "no_access"}` or
   `weekly_summary_not_available` / `owners_digest_email_not_available` for a
   missing feature. If access is lost after a delivery row is reserved, that row
   is marked skipped, not sent; the reservation is not successful delivery or
   quota consumption. Existing disabled/not-due/empty/missing-recipient skips remain.
- Financial gates return `{status: "skipped", reason: "no_access"}` or
   `feature_not_available`; sweeps expose skip counters without unauthorized
   computation/snapshot/alert writes or false alert resolution.
- Exhausted chase capacity alone returns `held` / `allowance_exhausted` for a
   new first chase. It does **not** interrupt underway sequences while access is
   valid. Expired/revoked sole access stops even underway sends.

Preserve invoices, usage history, `currentStage`, `firstChasedAt`, and existing
sequence scheduling on access denial; expiry does not pause/delete/reset them.
When access is restored, normal eligibility, claim cadence, and dedup still
apply—no immediate catch-up delivery or replay of a terminal skipped claim is
promised. Extending/changing a current grant retains its usage-window start and
consumption; a fresh post-lapse/revocation grant does not charge already-chased
invoices again. Monthly AI cadence is unchanged.

The [promise breach sweep](../../lib/email/breachSweep.ts) selects overdue
`active` **and** `broken` promises with `breachNotifiedAt: null`, excluding
paid/manually resolved invoices. If final notification authorization fails after
the promise became broken, it leaves `breachNotifiedAt` unset. A later sweep can
notify after restoration; only successful delivery sets that timestamp. Do not
mark an access skip notified to silence the retry.

Billing/authentication, own-operation recovery, connection cleanup, and
operational housekeeping retain their existing authentication/ownership checks
without becoming subscription-gated. Arrangement expiry and snooze-resume
housekeeping remain operational; resuming a stored invoice is not authorization
to send. No grant-cleanup task is needed to enforce expiry, and entitlement
correctness must not depend on a cleanup sweep running successfully.

#### Verification scope for this documentation update

Source comparison covers the worker selectors and
[selector tests](../../worker/tests/test_claims.py),
[reminder execution tests](../../tests/reminder-execution-access.test.ts),
[summary execution tests](../../tests/summary-execution-access.test.ts),
[financial execution tests](../../tests/financial-job-effective-access.test.ts),
and [broken-promise restoration tests](../../tests/financial-breach-job-access.test.ts).
On 17 October 2026, 502 focused mocked Node tests passed (0 failed/skipped)
across 15 customer/billing/entitlement/job test files, including the Node suites
linked here. Worker selector tests were inspected, not executed in this
documentation-only pass. No full suite, build, Python environment setup, provider
call, or database check was run. This does not establish live DB constraints, Railway/Vercel configuration,
deployed behavior, provider delivery, or browser acceptance. Cadence, claim-key
deduplication, reminder stage/transport keys, and delivery dedup rules are
unchanged by trial access. Do not delete claims or change keys to bypass an
access skip, and do not run competing schedulers against the same database.

## Prerequisites

Before provisioning Railway:

1. Deploy the current Prisma migrations to the matching Supabase environment.
2. Confirm `scheduled_task_claims` and `dispatcher_heartbeats` exist.
3. Have a working Vercel deployment for the same environment.
4. Have the matching `SUPABASE_PROJECT_REF` and database password available through the approved secret manager, and verify the Shared Pooler host in the Connect panel.
5. Generate two independent secrets:

   ```bash
   openssl rand -hex 32 # INTERNAL_JOBS_SECRET
   openssl rand -hex 32 # WORKER_TRIGGER_SECRET
   ```

6. Install and authenticate the Railway CLI if command-line access is needed:

   ```bash
   brew install railway
   railway login
   ```

Set up an isolated Python environment and run the worker's pure-logic tests
before the first deployment:

```bash
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m unittest discover -s tests
```

## 1. Create isolated environments

Use one Railway project with persistent `staging` and `production`
environments. Railway creates `production` by default; create `staging` from
the environment menu or with:

```bash
railway environment new staging
```

Environment mapping:

| Railway environment | Git branch | Supabase | Vercel target |
| --- | --- | --- | --- |
| `staging` | the team's staging or deployment-test branch | `paidsoon-dev` | stable Preview/staging URL |
| `production` | `main` | `paidsoon-prod` | `https://paidsoon.com` |

Do not enable automatic Railway PR environments for this stack while Vercel
previews share `paidsoon-dev`. Every environment would create another Beat
instance targeting the same database, making ownership and operational testing
ambiguous even though database claim keys reject duplicate claims.

Build and verify `staging` first. Duplicate or sync its service configuration
into `production`, then replace every environment-specific variable before
deploying production.

## 2. Add Railway-managed Redis

If you prefer to provision everything from the CLI, use the following exact sequence for the Railway CLI installed in this repo:

```bash
railway login
railway init
railway link <project-name-or-id>
railway add --name paidsoon-redis --template redis
```

This Railway version does not support `railway service create`. Create the app
services in the Railway project UI first, then attach the repository source to
each service with:

```bash
railway service source connect --repo <owner>/<repo> --branch <branch> --service paidsoon-worker
railway service source connect --repo <owner>/<repo> --branch <branch> --service paidsoon-beat
railway service source connect --repo <owner>/<repo> --branch <branch> --service paidsoon-web
```

If you need to link an already-created service instead of attaching a repo:

```bash
railway service link paidsoon-worker
railway service link paidsoon-beat
railway service link paidsoon-web
```

Then set the service runtime commands in the Railway UI or via the matching CLI
configuration for each service:

```bash
# paidsoon-worker
celery -A paidsoon_worker.celery_app worker --loglevel=info --concurrency=4

# paidsoon-beat
celery -A paidsoon_worker.celery_app beat --loglevel=info

# paidsoon-web
uvicorn paidsoon_worker.http_server:app --host 0.0.0.0 --port ${PORT:-8000}
```

Set the variables for each service with the real values from the environment matrix:

Add `SUPABASE_DB_PASSWORD` through Railway's dashboard or approved secret-manager interface on all three services. Do not place it in shell history, logs, or a preconstructed URL. Set `SUPABASE_DB_POOLER_HOST` only when the Connect panel differs from the documented default.

```bash
railway variables set --service paidsoon-worker \
  INTERNAL_JOBS_SECRET="$(openssl rand -hex 32)" \
  WORKER_TRIGGER_SECRET="$(openssl rand -hex 32)" \
  REDIS_URL="${{ paidsoon-redis.REDIS_URL }}" \
   SUPABASE_PROJECT_REF="<project-ref>" \
  PAIDSOON_APP_URL="https://<vercel-app-url>"

railway variables set --service paidsoon-beat \
  INTERNAL_JOBS_SECRET="$(openssl rand -hex 32)" \
  REDIS_URL="${{ paidsoon-redis.REDIS_URL }}" \
   SUPABASE_PROJECT_REF="<project-ref>"

railway variables set --service paidsoon-web \
  INTERNAL_JOBS_SECRET="$(openssl rand -hex 32)" \
  WORKER_TRIGGER_SECRET="$(openssl rand -hex 32)" \
  REDIS_URL="${{ paidsoon-redis.REDIS_URL }}" \
   SUPABASE_PROJECT_REF="<project-ref>" \
  PAIDSOON_APP_URL="https://<vercel-app-url>"
```

Use the exact secret-generation command without any trailing shell comment:

```bash
openssl rand -hex 32
```

Do not append `# INTERNAL_JOBS_SECRET` or `# WORKER_TRIGGER_SECRET` to the command;
that trailing text is treated as a shell argument and causes the familiar
`Extra option: 32` error.

In the target Railway environment:

1. Open the project canvas.
2. Select **New → Database → Redis**.
3. Name the service `Redis`.
4. Keep Redis private. Do not enable a TCP proxy or public networking.
5. Confirm the Redis service exposes `REDIS_URL` in its Variables tab.

PaidSoon does not rely on Redis backups for correctness. Postgres-backed claims
and the recovery sweep restore abandoned work after a Redis restart. Railway
Redis high availability may be added later for reduced downtime, but it is not
a prerequisite for the initial deployment.

## 3. Create the Python services

Create three services from the same GitHub repository. Configure each service
with:

| Setting | Value |
| --- | --- |
| Source repository | the PaidSoon repository |
| Root directory | `/worker` |
| Railway config file | `/worker/railway.toml` |
| Watch path | `/worker/**` |
| Builder | Dockerfile (`worker/Dockerfile`), inherited from `railway.toml` |

Set a distinct start command for each service:

| Service | Start command | Replicas | Public networking |
| --- | --- | ---: | --- |
| `paidsoon-worker` | `celery -A paidsoon_worker.celery_app worker --loglevel=info --concurrency=4` | 1 initially | disabled |
| `paidsoon-beat` | `celery -A paidsoon_worker.celery_app beat --loglevel=info` | **exactly 1** | disabled |
| `paidsoon-trigger-web` | `uvicorn paidsoon_worker.http_server:app --host 0.0.0.0 --port $PORT` | 1 | enabled |

The worker may be scaled after queue depth and provider limits are understood.
Never scale Beat above one replica. Database idempotency is a backstop, not a
reason to run competing schedulers.

For `paidsoon-trigger-web` only:

1. Open **Settings → Networking → Public Networking**.
2. Select **Generate Domain**.
3. Set the deployment health-check path to `/healthz`.
4. Record the resulting `https://...railway.app` URL for
   `RAILWAY_WORKER_URL` in Vercel.

Worker and Beat are not HTTP services, so do not configure HTTP health checks
for them. Their health is verified through logs, task state, and the Postgres
heartbeat.

## 4. Configure variables

Use the [Railway environment-variable matrix](./README.md#railway-environment-variable-matrix)
as the value source. Shared variables reduce drift across the three Python
services.

In **Project Settings → Shared Variables**, add the variables required by all
three services. Share them with `paidsoon-worker`, `paidsoon-beat`, and
`paidsoon-trigger-web`.

Set Redis through a reference variable on each Python service:

```dotenv
REDIS_URL=${{ Redis.REDIS_URL }}
```

This keeps traffic on Railway's private network and follows Redis credential
rotation automatically. Seal secret values after verification if your Railway
plan and environment workflow support sealed variables. Sealed variables are
not copied when duplicating services or environments, so re-enter them before
deploying a duplicate environment.

The worker validates `SUPABASE_PROJECT_REF`, percent-encodes `SUPABASE_DB_PASSWORD`,
and derives the transaction-pooler URL in memory. It strips Prisma-only
`pgbouncer` and `connection_limit` parameters immediately before psycopg. Never
configure `DATABASE_URL` on Railway.

If `PAIDSOON_APP_URL` is protected by Vercel Deployment Protection, create a
Protection Bypass for Automation secret in Vercel and set it as
`VERCEL_AUTOMATION_BYPASS_SECRET` in Railway. Leave this variable unset for an
unprotected production domain.

After adding or changing Railway variables, review and deploy the staged
changes. Saving a variable alone does not apply it to a running deployment.

## 5. Pair Railway with Vercel

Set these values on the matching Vercel environment using the
[canonical Vercel matrix](./README.md#environment-variable-matrix):

| Vercel variable | Required relationship |
| --- | --- |
| `INTERNAL_JOBS_SECRET` | exactly matches Railway |
| `WORKER_TRIGGER_SECRET` | exactly matches Railway |
| `RAILWAY_WORKER_URL` | public URL of `paidsoon-trigger-web`, without a trailing slash |
| `DISPATCH_INTERVAL_SECONDS` | exactly matches Railway's heartbeat interval |
| `OPS_ALERT_EMAIL` | monitored operations mailbox |
| `STALE_THRESHOLD_MULTIPLIER` | normally `10` |

Redeploy Vercel after changing these values. Existing deployments do not gain
new environment values automatically.

`INTERNAL_JOBS_SECRET` authenticates worker-to-Vercel calls.
`WORKER_TRIGGER_SECRET` authenticates Vercel-to-trigger-web calls. Never reuse
one value for both directions.

## 6. Deploy in a controlled order

Deploy one environment at a time in this order:

1. Redis.
2. `paidsoon-trigger-web`.
3. `paidsoon-worker`.
4. `paidsoon-beat` last.

Deploying Beat last prevents scheduled tasks from accumulating before a worker
can consume them. In production, confirm the staging checks below before
starting the production Beat service.

Useful CLI checks after linking the repository to the project and selecting a
service are:

```bash
railway status
railway deployment list
railway logs -n 100
railway metrics
```

## 7. Verify the deployment

### 7.1 Trigger API health

```bash
curl -i "$RAILWAY_WORKER_URL/healthz"
```

Expected: HTTP `200` and `{"ok":true}`.

Confirm an unauthenticated trigger is rejected:

```bash
curl -i -X POST "$RAILWAY_WORKER_URL/trigger/sync-connection" \
  -H 'Content-Type: application/json' \
  --data '{"accountingConnectionId":"invalid-health-check"}'
```

Expected: HTTP `401`. Do not use a real connection ID for this authentication
check.

### 7.2 Beat heartbeat

After at least one `DISPATCH_INTERVAL_SECONDS` interval:

1. Inspect `paidsoon-beat` logs for successful dispatcher cycles.
2. Confirm `dispatcher_heartbeats` contains a recent row for `celery-beat`.
3. Manually invoke the independent Vercel watchdog:

   ```bash
   curl -i "$PAIDSOON_APP_URL/api/cron/scheduling-watchdog" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

Expected: HTTP `200`, `"stale":false`, and a recent `lastRunAt`.

### 7.3 Queue and worker

Use staging data to exercise one existing **Sync now** action. Confirm:

1. Vercel returns a queued result rather than performing the sync inline.
2. `paidsoon-trigger-web` accepts the request.
3. `paidsoon-worker` receives and completes the task.
4. `scheduled_task_claims` reaches a terminal status.
5. The corresponding accounting sync run is recorded once.

Also inspect worker logs for Vercel HTML or redirects. A `401` response with a
Vercel sign-in page means `VERCEL_AUTOMATION_BYPASS_SECRET` is missing or does
not match the protected deployment.

## 8. Production cutover and monitoring

The operator approved a direct cutover without parallel burn-in. The legacy
Vercel routes do not consult `scheduled_task_claims`, so running them concurrently
with Railway Beat against the same database could duplicate sends or syncs.
The reminder/accounting entries have been removed from `vercel.json`; deploy and
verify the Production Cron Jobs page no longer lists either entry. Until that
deployment is complete, the old deployed schedules may still fire.

After cutover, monitor:

- Railway dispatcher heartbeats and Beat/worker logs;
- `scheduled_task_claims` for queued, retrying, failed, or stale processing work;
- `EmailLog` and `AccountingSyncRun` for missed or failed outcomes;
- heartbeat continuity across deployments and Redis restarts;
- recovery of claims left in `processing` beyond the configured threshold.

The independent Vercel watchdog remains scheduled because it observes Railway
through Postgres. The old cron route handlers remain protected by `CRON_SECRET`
for rollback/housekeeping; pause Railway Beat before invoking them manually.

## 9. Rollback

Before cutover, rollback is configuration-only:

1. Stop or scale `paidsoon-beat` to zero so no new scheduled work is enqueued.
2. Allow active worker tasks to finish, or stop the worker if continuing poses
   a customer-impact risk.
3. Remove `RAILWAY_WORKER_URL` from the affected Vercel environment and
   redeploy Vercel. Dashboard **Sync now** then falls back to inline execution.
4. Keep or restore the legacy Vercel cron entries.
5. Investigate failed or `processing` claims before restarting Beat.

No schema rollback or Redis restoration is required. Do not delete Postgres
claim history during an incident.

After final cutover, restoring the removed Vercel schedules requires a normal
code deployment. Keep the legacy route handlers in place; pause Railway Beat
before restoring their schedules to avoid concurrent processing.

## 10. Secret rotation

Rotate one request direction at a time during a maintenance window:

1. Stop Beat to prevent new scheduled calls.
2. Let active tasks drain.
3. Update the secret in Railway and deploy the staged change.
4. Update the matching Vercel variable and redeploy.
5. Verify the relevant request direction.
6. Restart Beat.

Because the current protocol accepts one secret per direction, changing both
sides is not atomic. Expect calls to fail between the two deployments and keep
that interval short.

## Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Celery cannot connect to Redis | missing or public `REDIS_URL` | use `${{ Redis.REDIS_URL }}` on each Python service |
| Beat runs but no tasks execute | worker stopped or using another Redis instance | compare resolved Redis references and worker logs |
| Duplicate scheduler activity | more than one Beat replica or environment targets the same DB | replica count, active Railway environments, `DISPATCHER_NAME` |
| Worker receives HTML or a Vercel redirect | Deployment Protection intercepted the request | `VERCEL_AUTOMATION_BYPASS_SECRET` |
| Internal job route returns `401` | `INTERNAL_JOBS_SECRET` mismatch | rotate and redeploy both sides |
| Trigger API returns `401` | `WORKER_TRIGGER_SECRET` mismatch | rotate and redeploy both sides |
| `SUPABASE_LEGACY_CONFLICT` | A stored `DATABASE_URL` differs from canonical derivation | remove the legacy variable after verifying canonical inputs |
| Watchdog reports stale Beat | Beat stopped, wrong DB, mismatched interval, or heartbeat write failure | Beat logs, DB target, interval values, heartbeat row |
| Trigger deployment fails health check | web process does not listen on Railway's `PORT` | start command and `/healthz` configuration |
