# PaidSoon worker image — used by all three Railway services
# (celery worker, celery beat, uvicorn trigger web). Each service overrides
# the start command in the Railway dashboard; see railway.toml/README.md.
#
# A custom Dockerfile is used instead of Nixpacks because Railway's Nixpacks
# builder injects every service variable (including SUPABASE_DB_PASSWORD,
# INTERNAL_JOBS_SECRET, WORKER_TRIGGER_SECRET) into the generated Dockerfile
# as ARG/ENV instructions, which fails BuildKit's SecretsUsedInArgOrEnv lint
# check. With a Dockerfile, Railway only exposes variables we explicitly
# declare via ARG — we declare none, so secrets stay runtime-only.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY paidsoon_worker ./paidsoon_worker

# Default process matches the Procfile "web" entry; Railway services for the
# Celery worker and Beat override this with their own start commands.
CMD uvicorn paidsoon_worker.http_server:app --host 0.0.0.0 --port ${PORT:-8000}
