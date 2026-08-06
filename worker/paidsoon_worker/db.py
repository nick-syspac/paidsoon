"""Durable state layer for scheduled_task_claims / dispatcher_heartbeats.

All durable orchestration state lives in Supabase Postgres (see design.md
"Supabase as Durable Source of Truth") — Redis is Celery's transient broker
only. This module is the only place raw SQL against those two tables lives.
"""

from __future__ import annotations

import contextlib
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row

from .config import Config

# Query params like `pgbouncer` / `connection_limit` are Prisma-only hints,
# not real libpq keywords — psycopg rejects them outright. Strip them so the
# same DATABASE_URL value can be shared with the Next.js app's Prisma config.
_UNSUPPORTED_CONNINFO_PARAMS = {"pgbouncer", "connection_limit"}


def _sanitize_conninfo(url: str) -> str:
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in _UNSUPPORTED_CONNINFO_PARAMS
    ]
    return urlunsplit(parts._replace(query=urlencode(query)))


@contextlib.contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    # prepare_threshold=None disables server-side prepared statements: Supavisor's
    # transaction-pooling mode can hand this connection a different backend server
    # between transactions, so a statement prepared earlier may not exist anymore.
    with psycopg.connect(
        _sanitize_conninfo(Config.DATABASE_URL),
        row_factory=dict_row,
        prepare_threshold=None,
    ) as conn:
        yield conn


def _claim_key(entity_id: str, suffix: str, scheduled_for: datetime) -> str:
    return f"{entity_id}:{suffix}:{scheduled_for.date().isoformat()}"


def claim_due_reminder_emails(limit: int = 200) -> list[dict[str, Any]]:
    """Atomically claims TrackedInvoice rows due for their next reminder.

    Uses `FOR UPDATE SKIP LOCKED` so concurrent dispatcher runs never block
    on (or double-claim) the same row, and a claim-key uniqueness conflict as
    a second, belt-and-braces idempotency guard.
    """
    with get_conn() as conn, conn.transaction():
        due = conn.execute(
            """
            SELECT id, "userId" AS user_id, "nextEmailAt" AS next_email_at
            FROM tracked_invoices
            WHERE status = 'pending'
              AND "currentStage" < 3
              AND "nextEmailAt" IS NOT NULL
              AND "nextEmailAt" <= now()
            ORDER BY "nextEmailAt"
            LIMIT %(limit)s
            FOR UPDATE SKIP LOCKED
            """,
            {"limit": limit},
        ).fetchall()

        claimed: list[dict[str, Any]] = []
        for row in due:
            claim_key = _claim_key(row["id"], "reminder_email", row["next_email_at"])
            inserted = conn.execute(
                """
                INSERT INTO scheduled_task_claims
                    (id, workflow, claim_key, entity_id, user_id, status,
                     scheduled_for, claimed_at, created_at, updated_at)
                VALUES
                    (gen_random_uuid()::text, 'reminder_email', %(claim_key)s,
                     %(entity_id)s, %(user_id)s, 'queued', %(scheduled_for)s,
                     now(), now(), now())
                ON CONFLICT (claim_key) DO NOTHING
                RETURNING id, entity_id, user_id
                """,
                {
                    "claim_key": claim_key,
                    "entity_id": row["id"],
                    "user_id": row["user_id"],
                    "scheduled_for": row["next_email_at"],
                },
            ).fetchone()
            if inserted:
                claimed.append(inserted)
        return claimed


def claim_due_accounting_connections(
    limit: int = 100, sync_interval_minutes: int = 1440
) -> list[dict[str, Any]]:
    """Atomically claims AccountingConnection rows due for their next sync."""
    with get_conn() as conn, conn.transaction():
        due = conn.execute(
            """
            SELECT id, "userId" AS user_id
            FROM accounting_connections
            WHERE status = 'active'
              AND (
                "last_synced_at" IS NULL
                OR "last_synced_at" <= now() - (%(interval_minutes)s::text || ' minutes')::interval
              )
            ORDER BY "last_synced_at" NULLS FIRST
            LIMIT %(limit)s
            FOR UPDATE SKIP LOCKED
            """,
            {"limit": limit, "interval_minutes": sync_interval_minutes},
        ).fetchall()

        claimed: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        for row in due:
            claim_key = _claim_key(row["id"], "accounting_sync", now)
            inserted = conn.execute(
                """
                INSERT INTO scheduled_task_claims
                    (id, workflow, claim_key, entity_id, user_id, status,
                     scheduled_for, claimed_at, created_at, updated_at)
                VALUES
                    (gen_random_uuid()::text, 'accounting_sync', %(claim_key)s,
                     %(entity_id)s, %(user_id)s, 'queued', now(), now(), now(), now())
                ON CONFLICT (claim_key) DO NOTHING
                RETURNING id, entity_id, user_id
                """,
                {
                    "claim_key": claim_key,
                    "entity_id": row["id"],
                    "user_id": row["user_id"],
                },
            ).fetchone()
            if inserted:
                claimed.append(inserted)
        return claimed


def claim_due_weekly_debtor_summaries() -> list[dict[str, Any]]:
    """Claims every eligible tenant for this week's debtor summary.

    The claim key is stable for the current UTC week, so repeated dispatches
    during the same week are idempotent at the database layer.
    """
    week_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    week_start -= timedelta(days=week_start.weekday())

    with get_conn() as conn, conn.transaction():
        rows = conn.execute(
            """
            SELECT "userId" AS user_id
            FROM user_profiles
            WHERE "subscriptionTier" IN ('small_business', 'accountant_partner')
              AND "subscriptionTier" IS NOT NULL
            ORDER BY "userId"
            """
        ).fetchall()

        claimed: list[dict[str, Any]] = []
        for row in rows:
            claim_key = _claim_key(row["user_id"], "debtor_summary", week_start)
            inserted = conn.execute(
                """
                INSERT INTO scheduled_task_claims
                    (id, workflow, claim_key, entity_id, user_id, status,
                     scheduled_for, claimed_at, created_at, updated_at)
                VALUES
                    (gen_random_uuid()::text, 'debtor_summary', %(claim_key)s,
                     %(entity_id)s, %(user_id)s, 'queued', now(), now(), now(), now())
                ON CONFLICT (claim_key) DO NOTHING
                RETURNING id, entity_id, user_id
                """,
                {
                    "claim_key": claim_key,
                    "entity_id": row["user_id"],
                    "user_id": row["user_id"],
                },
            ).fetchone()
            if inserted:
                claimed.append(inserted)
        return claimed


def claim_sweep_run(workflow: str) -> str | None:
    """Claims a single whole-run "sweep" slot for a scan-style workflow
    (catchup_and_snooze, promise_arrangement_sweep) — these operate on the
    whole table each run rather than one row at a time, but still get a
    claim-key row so they share the same status-lifecycle/idempotency
    contract as per-item work. Returns the claim id, or None if another
    dispatcher already claimed this minute's run.
    """
    now = datetime.now(timezone.utc)
    claim_key = f"{workflow}:sweep:{now.strftime('%Y-%m-%dT%H:%M')}"
    with get_conn() as conn, conn.transaction():
        inserted = conn.execute(
            """
            INSERT INTO scheduled_task_claims
                (id, workflow, claim_key, entity_id, user_id, status,
                 scheduled_for, claimed_at, created_at, updated_at)
            VALUES
                (gen_random_uuid()::text, %(workflow)s, %(claim_key)s,
                 %(workflow)s, NULL, 'queued', now(), now(), now(), now())
            ON CONFLICT (claim_key) DO NOTHING
            RETURNING id
            """,
            {"workflow": workflow, "claim_key": claim_key},
        ).fetchone()
        return inserted["id"] if inserted else None


def claim_manual_trigger(workflow: str, entity_id: str, user_id: str | None) -> str:
    """Creates a claim for a user-initiated "trigger now"/"sync now" action
    (worker/paidsoon_worker/http_server.py). Always succeeds (the claim key
    includes a timestamp) since a manual trigger is intentionally not deduped
    against the dispatcher's own schedule.
    """
    now = datetime.now(timezone.utc)
    claim_key = f"{entity_id}:{workflow}:manual:{now.isoformat()}"
    with get_conn() as conn, conn.transaction():
        inserted = conn.execute(
            """
            INSERT INTO scheduled_task_claims
                (id, workflow, claim_key, entity_id, user_id, status,
                 scheduled_for, claimed_at, created_at, updated_at)
            VALUES
                (gen_random_uuid()::text, %(workflow)s, %(claim_key)s,
                 %(entity_id)s, %(user_id)s, 'queued', now(), now(), now(), now())
            RETURNING id
            """,
            {
                "workflow": workflow,
                "claim_key": claim_key,
                "entity_id": entity_id,
                "user_id": user_id,
            },
        ).fetchone()
        return inserted["id"]


def mark_started(claim_id: str) -> None:
    _update_status(claim_id, status="started", extra={"started_at": "now()"})


def mark_processing(claim_id: str) -> None:
    _update_status(claim_id, status="processing")


def mark_sent(claim_id: str) -> None:
    _update_status(claim_id, status="sent", extra={"completed_at": "now()"})


def mark_failed(claim_id: str, error: str) -> None:
    _update_status(
        claim_id, status="failed", error=error, extra={"completed_at": "now()"}
    )


def mark_retrying(claim_id: str, error: str) -> None:
    _update_status(
        claim_id,
        status="retrying",
        error=error,
        extra={"attempts": '"attempts" + 1'},
    )


def _update_status(
    claim_id: str,
    *,
    status: str,
    error: str | None = None,
    extra: dict[str, str] | None = None,
) -> None:
    extra = extra or {}
    set_clauses = [
        f'"{key}" = {expr}' if key != "attempts" else f"attempts = {expr}"
        for key, expr in extra.items()
    ]
    set_sql = (", " + ", ".join(set_clauses)) if set_clauses else ""
    with get_conn() as conn, conn.transaction():
        conn.execute(
            f"""
            UPDATE scheduled_task_claims
            SET status = %(status)s, last_error = %(error)s, updated_at = now(){set_sql}
            WHERE id = %(claim_id)s
            """,
            {"status": status, "error": error, "claim_id": claim_id},
        )


def recover_stale_processing(threshold_seconds: int) -> list[dict[str, Any]]:
    """Reclaims scheduled_task_claims rows stuck in 'processing' or 'started'
    past the expected processing window (worker crash / Redis disruption),
    resetting them to 'queued' so they are picked up again. Returns the
    reclaimed rows so the caller can re-enqueue the corresponding Celery task.
    """
    with get_conn() as conn, conn.transaction():
        rows = conn.execute(
            """
            UPDATE scheduled_task_claims
            SET status = 'queued', updated_at = now()
            WHERE status IN ('processing', 'started')
              AND updated_at <= now() - (%(threshold_seconds)s::text || ' seconds')::interval
            RETURNING id, workflow, entity_id, user_id
            """,
            {"threshold_seconds": threshold_seconds},
        ).fetchall()
        return rows


def write_heartbeat(dispatcher: str) -> None:
    with get_conn() as conn, conn.transaction():
        conn.execute(
            """
            INSERT INTO dispatcher_heartbeats (id, dispatcher, last_run_at, updated_at)
            VALUES (gen_random_uuid()::text, %(dispatcher)s, now(), now())
            ON CONFLICT (dispatcher) DO UPDATE
                SET last_run_at = now(), updated_at = now()
            """,
            {"dispatcher": dispatcher},
        )
