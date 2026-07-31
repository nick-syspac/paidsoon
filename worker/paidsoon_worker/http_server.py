"""Lightweight HTTP surface for user-initiated "trigger now"/"sync now"
actions (design.md: "Starting an immediate sync when the user clicks a
button" stays a Vercel-initiated action, but the work itself is enqueued
onto Celery rather than run inline). Runs as the `web` process (Procfile)
alongside the `worker`/`beat` processes in the same Railway service.

Authenticated with WORKER_TRIGGER_SECRET — only the Next.js app calls this.
"""

from fastapi import FastAPI, Header, HTTPException

from . import db
from .config import Config
from .tasks import send_reminder_task, sync_connection_task

app = FastAPI(title="paidsoon-worker-trigger")


def _check_secret(authorization: str | None) -> None:
    expected = f"Bearer {Config.WORKER_TRIGGER_SECRET}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/trigger/sync-connection")
def trigger_sync_connection(
    payload: dict, authorization: str | None = Header(default=None)
) -> dict:
    _check_secret(authorization)
    connection_id = payload.get("accountingConnectionId")
    user_id = payload.get("userId")
    if not connection_id:
        raise HTTPException(
            status_code=400, detail="accountingConnectionId is required"
        )

    claim_id = db.claim_manual_trigger("accounting_sync", connection_id, user_id)
    sync_connection_task.delay(claim_id, user_id, connection_id)
    return {"queued": True, "claimId": claim_id}


@app.post("/trigger/send-reminder")
def trigger_send_reminder(
    payload: dict, authorization: str | None = Header(default=None)
) -> dict:
    _check_secret(authorization)
    tracked_invoice_id = payload.get("trackedInvoiceId")
    user_id = payload.get("userId")
    if not tracked_invoice_id or not user_id:
        raise HTTPException(
            status_code=400, detail="trackedInvoiceId and userId are required"
        )

    claim_id = db.claim_manual_trigger("reminder_email", tracked_invoice_id, user_id)
    send_reminder_task.delay(claim_id, user_id, tracked_invoice_id)
    return {"queued": True, "claimId": claim_id}
