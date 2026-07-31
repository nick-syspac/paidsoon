"""PaidSoon Railway Celery worker package.

See openspec/changes/migrate-scheduled-jobs-to-railway-celery/design.md for
the architecture this package implements: a Celery Beat dispatcher that
atomically claims due work from Supabase Postgres and enqueues one task per
claimed unit of work onto Redis, with idempotent claim keys, a status
lifecycle, retry/backoff, and a stale-processing recovery sweep.
"""
