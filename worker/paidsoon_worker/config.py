import os


class Config:
    # Read via os.environ.get (not os.environ[...]) so importing this module
    # doesn't require every env var to be set — e.g. pure-logic tests that
    # only exercise a helper function shouldn't need real Redis/DB/secret
    # values. Anything actually using these must handle a None/empty value
    # (Celery/psycopg will raise their own clear connection errors).
    REDIS_URL = os.environ.get("REDIS_URL", "")
    DATABASE_URL = os.environ.get("DATABASE_URL", "")
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

    # How often the Beat dispatcher runs (design.md: 1-5 minutes).
    DISPATCH_INTERVAL_SECONDS = int(os.environ.get("DISPATCH_INTERVAL_SECONDS", "120"))

    # A claim left in `processing` longer than this is assumed to be an
    # abandoned/crashed task and is reclaimed by the recovery sweep.
    STALE_PROCESSING_THRESHOLD_SECONDS = int(
        os.environ.get("STALE_PROCESSING_THRESHOLD_SECONDS", "600")
    )

    MAX_TASK_RETRIES = int(os.environ.get("MAX_TASK_RETRIES", "5"))
    RETRY_BACKOFF_BASE_SECONDS = int(os.environ.get("RETRY_BACKOFF_BASE_SECONDS", "30"))
