import httpx

from .config import Config


class InternalJobError(RuntimeError):
    """Raised when an internal Next.js job endpoint responds with an error."""


def call_internal_job(path: str, payload: dict) -> dict:
    """POSTs to one of the Next.js internal job routes
    (app/api/internal/jobs/*), authenticated with INTERNAL_JOBS_SECRET.
    Raises on any non-2xx response so Celery's retry/backoff kicks in.
    """
    url = f"{Config.PAIDSOON_APP_URL}{path}"
    response = httpx.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {Config.INTERNAL_JOBS_SECRET}"},
        timeout=55.0,
    )
    if response.status_code >= 400:
        raise InternalJobError(
            f"{path} returned {response.status_code}: {response.text[:500]}"
        )
    return response.json()
