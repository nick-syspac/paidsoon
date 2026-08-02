import httpx

from .config import Config


class InternalJobError(RuntimeError):
    """Raised when an internal Next.js job endpoint responds with an error."""


def call_internal_job(path: str, payload: dict) -> dict:
    """POSTs to one of the Next.js internal job routes
    (app/api/internal/jobs/*), authenticated with INTERNAL_JOBS_SECRET.
    Raises on any non-2xx response so Celery's retry/backoff kicks in.
    """
    if not Config.PAIDSOON_APP_URL.startswith(("http://", "https://")):
        raise InternalJobError(
            "PAIDSOON_APP_URL is not set to an absolute http(s) URL "
            f"(got {Config.PAIDSOON_APP_URL!r}) — check the worker's Railway env vars"
        )
    if not Config.INTERNAL_JOBS_SECRET:
        raise InternalJobError(
            "INTERNAL_JOBS_SECRET is not set — check the worker's Railway env vars"
        )
    url = f"{Config.PAIDSOON_APP_URL}{path}"
    headers = {"Authorization": f"Bearer {Config.INTERNAL_JOBS_SECRET}"}
    # Bypasses Vercel Deployment Protection (Vercel Authentication) on
    # protected preview/dev domains, which otherwise 401s every request
    # before it reaches our route handler. No-op if unset (production
    # domains typically aren't protected).
    if Config.VERCEL_AUTOMATION_BYPASS_SECRET:
        headers["x-vercel-protection-bypass"] = Config.VERCEL_AUTOMATION_BYPASS_SECRET
    response = httpx.post(
        url,
        json=payload,
        headers=headers,
        timeout=55.0,
    )
    if response.status_code >= 400:
        raise InternalJobError(
            f"{path} returned {response.status_code}: {response.text[:500]}"
        )
    return response.json()
