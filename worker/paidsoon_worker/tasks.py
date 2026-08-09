"""Per-item Celery tasks. Each task delegates the actual business logic to a
Next.js internal job route (reusing the existing TypeScript implementation
of the three-stage reminder rules, chase-volume gating, custom-domain
resolution, Xero/MYOB sync, etc.) rather than reimplementing it in Python —
see design.md's "Celery tasks delegate to internal API routes" decision.
This task module owns only: status-lifecycle tracking, retry/backoff, and
calling the internal route.
"""

from celery import Task

from . import db
from .api_client import call_internal_job
from .celery_app import app
from .config import Config

RETRY_KWARGS = dict(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=Config.MAX_TASK_RETRIES,
)


class ClaimTrackingTask(Task):
    """Base task that mirrors Celery's own retry lifecycle into
    scheduled_task_claims, so a claim's status is always reconstructable
    from Postgres alone (see design.md "Task Status Lifecycle")."""

    def on_success(self, retval, task_id, args, kwargs):
        db.mark_sent(args[0])

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        db.mark_retrying(args[0], str(exc))

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        db.mark_failed(args[0], str(exc))


@app.task(name="tasks.send_reminder", bind=True, base=ClaimTrackingTask, **RETRY_KWARGS)
def send_reminder_task(self, claim_id: str, user_id: str, tracked_invoice_id: str):
    db.mark_started(claim_id)
    db.mark_processing(claim_id)
    result = call_internal_job(
        "/api/internal/jobs/send-reminder",
        {"userId": user_id, "trackedInvoiceId": tracked_invoice_id},
    )
    if result.get("outcome") == "error":
        raise RuntimeError(result.get("reason", "send_failed"))
    return result


@app.task(
    name="tasks.sync_connection", bind=True, base=ClaimTrackingTask, **RETRY_KWARGS
)
def sync_connection_task(
    self, claim_id: str, user_id: str, accounting_connection_id: str
):
    db.mark_started(claim_id)
    db.mark_processing(claim_id)
    result = call_internal_job(
        "/api/internal/jobs/sync-connection",
        {"accountingConnectionId": accounting_connection_id},
    )
    if result.get("status") == "failed":
        raise RuntimeError(result.get("errorMessage", "sync_failed"))
    return result


@app.task(
    name="tasks.catchup_snooze_sweep", bind=True, base=ClaimTrackingTask, **RETRY_KWARGS
)
def catchup_snooze_sweep_task(self, claim_id: str):
    db.mark_started(claim_id)
    db.mark_processing(claim_id)
    return call_internal_job("/api/internal/jobs/catchup-snooze-sweep", {})


@app.task(
    name="tasks.promise_arrangement_sweep",
    bind=True,
    base=ClaimTrackingTask,
    **RETRY_KWARGS,
)
def promise_arrangement_sweep_task(self, claim_id: str):
    db.mark_started(claim_id)
    db.mark_processing(claim_id)
    return call_internal_job("/api/internal/jobs/promise-arrangement-sweep", {})


@app.task(
    name="tasks.weekly_debtor_summary",
    bind=True,
    base=ClaimTrackingTask,
    **RETRY_KWARGS,
)
def weekly_debtor_summary_task(self, claim_id: str, user_id: str):
    db.mark_started(claim_id)
    db.mark_processing(claim_id)
    result = call_internal_job(
        "/api/internal/jobs/send-weekly-debtor-summary",
        {"userId": user_id},
    )
    if result.get("status") == "failed":
        raise RuntimeError(result.get("reason", "weekly_summary_failed"))
    return result
