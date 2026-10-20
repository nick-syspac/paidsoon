"""D7 extension of the existing Railway owner; Postgres owns work lifecycle.

No ClaimTrackingTask, broker retry counter, or financial/entitlement SQL here.
The release gate is intentionally code-disabled until separately authorized.
"""

from celery.utils.log import get_task_logger

from .api_client import call_internal_job
from .celery_app import app
from .config import Config

logger = get_task_logger(__name__)
_daily_cursor = None
_repair_state = None


@app.task(name="tasks.commitguard_work")
def commitguard_work_task(user_id: str, work_item_id: str, kind: str) -> dict:
    # HTTP failure/worker crash leaves Postgres pending or lease-recoverable.
    # Explicit 202 deferred is not completed/sent, nor a Celery autoretry loop.
    return call_internal_job(
        "/api/internal/jobs/commitguard",
        {"userId": user_id, "workItemId": work_item_id, "kind": kind},
    )


@app.task(name="dispatcher.dispatch_commitguard")
def dispatch_commitguard() -> int:
    global _daily_cursor, _repair_state
    if not Config.COMMITGUARD_DISPATCH_ENABLED:
        return 0
    payload = {"dailyCursor": _daily_cursor, "repairState": _repair_state}
    result = call_internal_job(
        "/api/internal/jobs/commitguard/dispatch", payload
    )
    # Keyset pagination advances even past denied tenants. Cursor is only a scan
    # hint in this process, never authorization/durable work. Restart resets the
    # pass safely; Postgres daily uniqueness and pending discovery remain intact.
    _daily_cursor = result["dailyCursor"]
    # Server UTC date bounds one daily repair pass; each stream advances its own
    # page across five-minute ticks, even past individual source repair failures.
    # This is only a hint: canonical Postgres work survives restarts/enqueue loss.
    _repair_state = result["repairState"]
    queued = 0
    for job in result["jobs"]:
        try:
            commitguard_work_task.delay(job["userId"], job["workItemId"], job["kind"])
            queued += 1
        except Exception:
            # Lost enqueue has NO durable state transition. Next scan rediscovers
            # it; continue independent items, never log broker payload/errors.
            logger.warning("commitguard enqueue_failed")
    logger.info("commitguard queued %d recovered %d", queued, result["recovered"])
    return queued