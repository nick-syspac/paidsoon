import logging
import sys

from celery import Celery
from celery.schedules import schedule
from celery.schedules import crontab
from celery.signals import setup_logging

from .config import Config

Config.database_url()

app = Celery(
    "paidsoon_worker",
    broker=Config.REDIS_URL,
    backend=Config.REDIS_URL,
    include=["paidsoon_worker.tasks", "paidsoon_worker.dispatcher"],
)

app.conf.timezone = "UTC"
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1


@setup_logging.connect
def _configure_logging(**kwargs):
    # Celery's default logging goes to stderr, which Railway flags as "error"
    # for every line regardless of the actual log level. Route to stdout instead.
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("[%(asctime)s: %(levelname)s/%(processName)s] %(message)s")
    )
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)


# Celery Beat schedule — run this app's `beat` process (Procfile) as exactly
# ONE Railway instance (design.md "Single Celery Beat Instance"). Each entry
# below claims due work atomically (db.py) before enqueuing, so even if this
# invariant is ever violated, duplicate claims are rejected at the DB level.
app.conf.beat_schedule = {
    "dispatch-reminder-emails": {
        "task": "dispatcher.dispatch_reminder_emails",
        "schedule": schedule(run_every=Config.DISPATCH_REMINDER_INTERVAL_SECONDS),
    },
    "dispatch-accounting-sync": {
        "task": "dispatcher.dispatch_accounting_sync",
        "schedule": schedule(
            run_every=Config.DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS
        ),
    },
    "dispatch-catchup-and-snooze-sweep": {
        "task": "dispatcher.dispatch_catchup_and_snooze_sweep",
        "schedule": schedule(run_every=Config.DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS),
    },
    "dispatch-promise-arrangement-sweep": {
        "task": "dispatcher.dispatch_promise_arrangement_sweep",
        "schedule": schedule(
            run_every=Config.DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS
        ),
    },
    "dispatch-weekly-debtor-summary": {
        "task": "dispatcher.dispatch_weekly_debtor_summary",
        "schedule": crontab(minute=0, hour=9, day_of_week="mon"),
    },
    "recovery-sweep": {
        "task": "dispatcher.recovery_sweep",
        "schedule": schedule(
            run_every=max(Config.DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS, 300)
        ),
    },
    "write-heartbeat": {
        "task": "dispatcher.write_heartbeat",
        # Beat-liveness signal only — intentionally NOT split per-task; see config.py.
        "schedule": schedule(run_every=Config.DISPATCH_INTERVAL_SECONDS),
    },
}
