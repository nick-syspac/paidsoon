import os

from .supabase_environment import get_database_url


class Config:
    # Read via os.environ.get (not os.environ[...]) so importing this module
    # doesn't require every env var to be set — e.g. pure-logic tests that
    # only exercise a helper function shouldn't need real Redis/DB/secret
    # values. Anything actually using these must handle a None/empty value
    # (Celery/psycopg will raise their own clear connection errors).
    REDIS_URL = os.environ.get("REDIS_URL", "")
    INTERNAL_JOBS_SECRET = os.environ.get("INTERNAL_JOBS_SECRET", "")
    PAIDSOON_APP_URL = os.environ.get("PAIDSOON_APP_URL", "").rstrip("/")
    WORKER_TRIGGER_SECRET = os.environ.get("WORKER_TRIGGER_SECRET", "")
    # Only needed if PAIDSOON_APP_URL points at a Vercel deployment with
    # Deployment Protection (Vercel Authentication) enabled, e.g. dev/preview
    # domains — see Vercel project Settings -> Deployment Protection ->
    # Protection Bypass for Automation.
    VERCEL_AUTOMATION_BYPASS_SECRET = os.environ.get(
        "VERCEL_AUTOMATION_BYPASS_SECRET", ""
    )
    DISPATCHER_NAME = os.environ.get("DISPATCHER_NAME", "celery-beat")

    # Cadence of the `write-heartbeat` Beat entry only (design.md: 1-5 minutes)
    # — this is the "is Celery Beat alive" signal the Vercel watchdog checks,
    # decoupled from the five per-task dispatch intervals below. It also
    # supplies each per-task interval's default when that var is unset, so a
    # deployment that only sets this one var keeps today's behavior unchanged.
    DISPATCH_INTERVAL_SECONDS = int(os.environ.get("DISPATCH_INTERVAL_SECONDS", "120"))

    # Per-task dispatch intervals — each defaults to DISPATCH_INTERVAL_SECONDS
    # when unset, so existing single-var deployments are unaffected.
    DISPATCH_REMINDER_INTERVAL_SECONDS = int(
        os.environ.get(
            "DISPATCH_REMINDER_INTERVAL_SECONDS", str(DISPATCH_INTERVAL_SECONDS)
        )
    )
    DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS = int(
        os.environ.get(
            "DISPATCH_ACCOUNTING_SYNC_INTERVAL_SECONDS", str(DISPATCH_INTERVAL_SECONDS)
        )
    )
    DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS = int(
        os.environ.get(
            "DISPATCH_CATCHUP_SNOOZE_INTERVAL_SECONDS", str(DISPATCH_INTERVAL_SECONDS)
        )
    )
    DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS = int(
        os.environ.get(
            "DISPATCH_PROMISE_ARRANGEMENT_INTERVAL_SECONDS",
            str(DISPATCH_INTERVAL_SECONDS),
        )
    )
    # Floored at 300s in celery_app.py, same as before this var existed.
    DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS = int(
        os.environ.get(
            "DISPATCH_RECOVERY_SWEEP_INTERVAL_SECONDS", str(DISPATCH_INTERVAL_SECONDS)
        )
    )

    # A claim left in `processing` longer than this is assumed to be an
    # abandoned/crashed task and is reclaimed by the recovery sweep.
    STALE_PROCESSING_THRESHOLD_SECONDS = int(
        os.environ.get("STALE_PROCESSING_THRESHOLD_SECONDS", "600")
    )

    MAX_TASK_RETRIES = int(os.environ.get("MAX_TASK_RETRIES", "5"))
    RETRY_BACKOFF_BASE_SECONDS = int(os.environ.get("RETRY_BACKOFF_BASE_SECONDS", "30"))

    @staticmethod
    def database_url() -> str:
        return get_database_url()
