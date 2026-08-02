"""Celery Beat dispatcher tasks — atomically claim due work (db.py) and
enqueue one per-item task per claimed row. See design.md "Atomic Due-Work
Dispatch": this module intentionally does NOT create a static Beat schedule
entry per invoice/connection; the per-item tasks below are enqueued
dynamically from the claims the dispatcher makes each run.
"""

from celery.utils.log import get_task_logger

from . import db
from .celery_app import app
from .config import Config
from .tasks import (
    catchup_snooze_sweep_task,
    promise_arrangement_sweep_task,
    send_reminder_task,
    sync_connection_task,
)

logger = get_task_logger(__name__)


@app.task(name="dispatcher.dispatch_reminder_emails")
def dispatch_reminder_emails() -> int:
    claims = db.claim_due_reminder_emails()
    for claim in claims:
        send_reminder_task.delay(claim["id"], claim["user_id"], claim["entity_id"])
    logger.info("dispatch_reminder_emails claimed %d", len(claims))
    return len(claims)


@app.task(name="dispatcher.dispatch_accounting_sync")
def dispatch_accounting_sync() -> int:
    claims = db.claim_due_accounting_connections()
    for claim in claims:
        sync_connection_task.delay(claim["id"], claim["user_id"], claim["entity_id"])
    logger.info("dispatch_accounting_sync claimed %d", len(claims))
    return len(claims)


@app.task(name="dispatcher.dispatch_catchup_and_snooze_sweep")
def dispatch_catchup_and_snooze_sweep() -> bool:
    claim_id = db.claim_sweep_run("catchup_and_snooze")
    if claim_id:
        catchup_snooze_sweep_task.delay(claim_id)
    return bool(claim_id)


@app.task(name="dispatcher.dispatch_promise_arrangement_sweep")
def dispatch_promise_arrangement_sweep() -> bool:
    claim_id = db.claim_sweep_run("promise_arrangement_sweep")
    if claim_id:
        promise_arrangement_sweep_task.delay(claim_id)
    return bool(claim_id)


@app.task(name="dispatcher.recovery_sweep")
def recovery_sweep() -> int:
    """Reclaims claims stuck in 'processing'/'started' past the expected
    processing window (worker crash or Redis disruption) and re-enqueues the
    matching task — see design.md "Stale Processing Recovery Sweep"."""
    reclaimed = db.recover_stale_processing(Config.STALE_PROCESSING_THRESHOLD_SECONDS)
    for row in reclaimed:
        _reenqueue(row)
    if reclaimed:
        logger.warning("recovery_sweep reclaimed %d stuck claim(s)", len(reclaimed))
    return len(reclaimed)


def _reenqueue(row: dict) -> None:
    workflow = row["workflow"]
    if workflow == "reminder_email":
        send_reminder_task.delay(row["id"], row["user_id"], row["entity_id"])
    elif workflow == "accounting_sync":
        sync_connection_task.delay(row["id"], row["user_id"], row["entity_id"])
    elif workflow == "catchup_and_snooze":
        catchup_snooze_sweep_task.delay(row["id"])
    elif workflow == "promise_arrangement_sweep":
        promise_arrangement_sweep_task.delay(row["id"])
    else:
        logger.error(
            "recovery_sweep: unknown workflow %r for claim %s", workflow, row["id"]
        )


@app.task(name="dispatcher.write_heartbeat")
def write_heartbeat() -> None:
    db.write_heartbeat(Config.DISPATCHER_NAME)
