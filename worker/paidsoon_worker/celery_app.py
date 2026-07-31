from celery import Celery
from celery.schedules import schedule

from .config import Config

app = Celery(
    "paidsoon_worker",
    broker=Config.REDIS_URL,
    backend=Config.REDIS_URL,
    include=["paidsoon_worker.tasks", "paidsoon_worker.dispatcher"],
)

app.conf.timezone = "UTC"
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1

# Celery Beat schedule — run this app's `beat` process (Procfile) as exactly
# ONE Railway instance (design.md "Single Celery Beat Instance"). Each entry
# below claims due work atomically (db.py) before enqueuing, so even if this
# invariant is ever violated, duplicate claims are rejected at the DB level.
app.conf.beat_schedule = {
    "dispatch-reminder-emails": {
        "task": "dispatcher.dispatch_reminder_emails",
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
    "dispatch-accounting-sync": {
        "task": "dispatcher.dispatch_accounting_sync",
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
    "dispatch-catchup-and-snooze-sweep": {
        "task": "dispatcher.dispatch_catchup_and_snooze_sweep",
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
    "dispatch-promise-arrangement-sweep": {
        "task": "dispatcher.dispatch_promise_arrangement_sweep",
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
    "recovery-sweep": {
        "task": "dispatcher.recovery_sweep",
        "schedule": schedule(run_every=max(Config.DISPATCH_INTERVAL_SECONDS, 300)),
    },
    "write-heartbeat": {
        "task": "dispatcher.write_heartbeat",
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
}
