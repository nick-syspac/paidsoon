from __future__ import annotations

import os
import re
from collections.abc import Mapping
from urllib.parse import quote, urlsplit

DEFAULT_POOLER_HOST = "aws-1-ap-southeast-2.pooler.supabase.com"
RUNTIME_PORT = 6543
DATABASE = "postgres"
RUNTIME_QUERY = "pgbouncer=true&connection_limit=1"

_PROJECT_REF_PATTERN = re.compile(r"^[a-z0-9]{20}$")
_POOLER_HOST_PATTERN = re.compile(r"^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$")


class SupabaseConfigError(ValueError):
    def __init__(self, code: str, variable_name: str) -> None:
        self.code = code
        self.variable_name = variable_name
        super().__init__(f"{code}: invalid Supabase configuration for {variable_name}")


def create_database_url(
    project_ref: str | None,
    password: str | None,
    pooler_host: str | None = None,
) -> str:
    if project_ref is None:
        raise SupabaseConfigError(
            "SUPABASE_PROJECT_REF_MISSING", "SUPABASE_PROJECT_REF"
        )
    if not _PROJECT_REF_PATTERN.fullmatch(project_ref):
        raise SupabaseConfigError(
            "SUPABASE_PROJECT_REF_INVALID", "SUPABASE_PROJECT_REF"
        )
    if not password:
        raise SupabaseConfigError(
            "SUPABASE_DB_PASSWORD_MISSING", "SUPABASE_DB_PASSWORD"
        )

    resolved_host = DEFAULT_POOLER_HOST if pooler_host is None else pooler_host
    if not _POOLER_HOST_PATTERN.fullmatch(resolved_host):
        raise SupabaseConfigError(
            "SUPABASE_POOLER_HOST_INVALID", "SUPABASE_DB_POOLER_HOST"
        )

    encoded_password = quote(password, safe="")
    database_url = (
        f"postgresql://postgres.{project_ref}:{encoded_password}@{resolved_host}:"
        f"{RUNTIME_PORT}/{DATABASE}?{RUNTIME_QUERY}"
    )
    parsed = urlsplit(database_url)
    if (
        parsed.scheme != "postgresql"
        or parsed.hostname != resolved_host
        or parsed.port != RUNTIME_PORT
        or parsed.path != f"/{DATABASE}"
        or parsed.query != RUNTIME_QUERY
        or parsed.fragment
    ):
        raise SupabaseConfigError("SUPABASE_DERIVED_URL_INVALID", "DATABASE_URL")
    return database_url


def get_database_url(environ: Mapping[str, str] | None = None) -> str:
    source = os.environ if environ is None else environ
    database_url = create_database_url(
        source.get("SUPABASE_PROJECT_REF"),
        source.get("SUPABASE_DB_PASSWORD"),
        source.get("SUPABASE_DB_POOLER_HOST"),
    )
    legacy_url = source.get("DATABASE_URL")
    if legacy_url is not None and legacy_url != database_url:
        raise SupabaseConfigError("SUPABASE_LEGACY_CONFLICT", "DATABASE_URL")
    return database_url