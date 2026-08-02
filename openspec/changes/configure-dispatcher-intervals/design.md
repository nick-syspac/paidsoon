## Context

`worker/paidsoon_worker/config.py` reads `DISPATCH_INTERVAL_SECONDS` (default `120`) and drives
every entry in `worker/paidsoon_worker/celery_app.py`'s `app.conf.beat_schedule` off that one
value: `dispatch-reminder-emails`, `dispatch-accounting-sync`,
`dispatch-catchup-and-snooze-sweep`, `dispatch-promise-arrangement-sweep`, `recovery-sweep`
(floored at `max(DISPATCH_INTERVAL_SECONDS, 300)`), and `write-heartbeat` all share it. Three
other config values (`STALE_PROCESSING_THRESHOLD_SECONDS`, `MAX_TASK_RETRIES`,
`RETRY_BACKOFF_BASE_SECONDS`) are also read from the environment but appear nowhere in
`worker/.env.example`, `worker/README.md`, or `docs/runbooks/README.md`.

Separately, `app/api/cron/scheduling-watchdog/route.ts` (Vercel side) hardcodes
`STALE_THRESHOLD_MINUTES = 20` — sized only by a code comment ("comfortably larger than the
dispatcher's own 1-5 minute interval") with nothing enforcing that relationship. Vercel and
Railway are separate deployments/env-var scopes; there is no runtime mechanism for one to read
the other's configuration.

This builds directly on the in-progress `migrate-scheduled-jobs-to-railway-celery` change (its
`scheduled-job-orchestration` and `scheduled-job-health-monitoring` capabilities) and assumes
that change's `worker/` implementation as the starting point.

## Goals / Non-Goals

**Goals:**
- Every worker env var actually read by `config.py` is documented in `worker/.env.example`,
  `worker/README.md`, and `docs/runbooks/README.md`.
- Each of the five dispatcher tasks can have its cadence tuned independently via its own env
  var, without editing code.
- `DISPATCH_INTERVAL_SECONDS` keeps a single, narrower meaning: the Celery Beat
  heartbeat/liveness cadence (`write-heartbeat`, and the `recovery-sweep` floor, which is also a
  Beat/worker-health concern rather than a business-dispatch one).
- The Vercel watchdog's staleness threshold is computed from that heartbeat cadence rather than
  hardcoded, so the two can't silently drift apart.
- Zero behavior change for a deployment that only ever sets `DISPATCH_INTERVAL_SECONDS` (today's
  only knob) — all five new per-task vars default to its value.

**Non-Goals:**
- Not adding per-task staleness/SLA alerting (e.g. "alert if `dispatch-accounting-sync`
  specifically hasn't run in N× its own interval"). The watchdog continues to answer only "is
  Celery Beat alive at all," via the heartbeat.
- Not changing reminder timing, chase-volume rules, retry/backoff behavior, or any other
  business logic — purely scheduling-cadence configuration.
- Not building a shared-config mechanism between Vercel and Railway (e.g. Railway API calls,
  shared secret store). The two projects keep independent env vars; consistency is maintained by
  documentation + the multiplier design below, not automation.

## Decisions

- **Five new per-task env vars, each defaulting to `DISPATCH_INTERVAL_SECONDS`.**
  `DISPATCH_REMINDER_INTERVAL_SECONDS`, `DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS`,
  `DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS`, `DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS`,
  `DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS` (this last one still floored at 300s, same as
  today, to preserve the existing "recovery sweep never runs more than every 5 min" guarantee).
  Alternative considered: a single JSON/CSV env var encoding all five at once (e.g.
  `DISPATCH_INTERVALS={"reminder":120,...}`) — rejected, since individual scalar env vars are
  the existing convention throughout `config.py` and are far easier to set correctly on
  Railway's dashboard than a JSON blob.
- **`DISPATCH_INTERVAL_SECONDS` narrows to heartbeat-only.** `write-heartbeat`'s schedule keeps
  reading `Config.DISPATCH_INTERVAL_SECONDS` directly; it does NOT get its own new env var. This
  is deliberate: the heartbeat's entire purpose is proving Beat itself is alive, independent of
  any business task's cadence, so it shouldn't be tunable per-task-like — it needs exactly one
  stable, well-known cadence the watchdog can reason about.
  Alternative considered: give `write-heartbeat` its own `HEARTBEAT_INTERVAL_SECONDS` and retire
  `DISPATCH_INTERVAL_SECONDS` entirely — rejected to avoid an unnecessary rename/migration of an
  existing, already-deployed env var when its narrowed meaning (heartbeat cadence) is what it
  effectively already controls today for the `write-heartbeat` entry.
- **Vercel watchdog threshold = `DISPATCH_INTERVAL_SECONDS × STALE_THRESHOLD_MULTIPLIER`,
  requiring `DISPATCH_INTERVAL_SECONDS` to also be set in the Vercel project.** This is the only
  way to make the threshold genuinely "relative to" the heartbeat cadence given Vercel and
  Railway are separate env-var scopes with no runtime channel between them — see Risks below for
  the duplication this implies. Default `STALE_THRESHOLD_MULTIPLIER` is chosen so that, combined
  with the existing default `DISPATCH_INTERVAL_SECONDS=120`, the computed threshold matches
  today's `20` minutes exactly (`120s × 10 = 1200s = 20min`), so a deployment that doesn't
  touch either new var sees no behavior change.
  Alternative considered: keep `STALE_THRESHOLD_MINUTES` hardcoded, just add a comment noting the
  current default interval it assumes — rejected because the user explicitly wants the
  threshold to track the interval, not merely document an assumption that can silently go stale.
  Alternative considered: derive the threshold from the *slowest* of the five per-task
  intervals — rejected per the Non-Goals above; that conflates "Beat is alive" with "every task
  ran on schedule," a different (and not-yet-requested) feature.
- **`docs/runbooks/README.md` env matrix gets every var from this change**, per the repo's
  existing rule that new env vars must be documented there.

## Risks / Trade-offs

- **Duplicated `DISPATCH_INTERVAL_SECONDS` across two deployments (Railway worker + Vercel app)**
  → Mitigation: document explicitly in both `.env.example`/README locations that this specific
  var must be kept identical in both places, and note it in `docs/runbooks/README.md`'s env
  matrix with a cross-reference. This is a manual-sync risk, not eliminated, only documented —
  acceptable given no automated cross-project config channel exists.
- **`recovery-sweep`'s 300s floor no longer aligns with `DISPATCH_INTERVAL_SECONDS`'s narrowed
  meaning** (it's now closer to a "business task" than the heartbeat, but reads its own new env
  var) → Mitigation: keep its existing default/floor behavior unchanged; this is a naming/scope
  clarification, not a behavior change, so risk is limited to documentation clarity.
- **Five new independent intervals make Beat's actual dispatch cadence harder to reason about
  at a glance** (previously "everything runs every N seconds," now five different N's) →
  Mitigation: `worker/README.md` gets a table listing all six schedule entries with their env
  var and default, so the full picture is visible in one place.

## Migration Plan

1. Add the five new config fields (with `DISPATCH_INTERVAL_SECONDS`-derived defaults) and wire
   `celery_app.py`'s `beat_schedule` to them.
2. Add `STALE_THRESHOLD_MULTIPLIER` handling to the watchdog route, replacing the hardcoded
   constant, with a default that reproduces today's 20-minute threshold given the default
   `DISPATCH_INTERVAL_SECONDS`.
3. Update `worker/.env.example`, `worker/README.md`, `docs/runbooks/README.md`.
4. Deploy worker first (fully backward compatible — no new vars required). Confirm Beat logs
   show the same effective cadence as before.
5. Add `DISPATCH_INTERVAL_SECONDS` and `STALE_THRESHOLD_MULTIPLIER` to the Vercel project env
   (values that reproduce today's 20-minute threshold) and deploy the watchdog route change.
6. Confirm `scheduling-watchdog`'s next run computes the expected threshold (verify via its JSON
   response or logs) before considering this change complete.
- No rollback complexity: every new var is optional with a default reproducing current behavior,
  so simply unsetting them (or reverting the code) restores today's behavior exactly.

## Open Questions

- Should `DISPATCH_INTERVAL_SECONDS` eventually be renamed (e.g. `HEARTBEAT_INTERVAL_SECONDS`)
  once all five per-task vars exist, to make its narrowed scope unambiguous? Deferred here to
  avoid an env-var rename/migration in the same change that introduces the new vars.
