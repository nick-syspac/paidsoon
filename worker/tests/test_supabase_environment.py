import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from paidsoon_worker.supabase_environment import (
    DATABASE,
    DEFAULT_POOLER_HOST,
    RUNTIME_PORT,
    RUNTIME_QUERY,
    SupabaseConfigError,
    create_database_url,
    get_database_url,
)

ROOT = Path(__file__).resolve().parents[2]


class SupabaseEnvironmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.topology = json.loads(
            (ROOT / "config" / "supabase-environment.json").read_text()
        )
        cls.vectors = json.loads(
            (ROOT / "config" / "supabase-environment-vectors.json").read_text()
        )

    def assert_secrets_redacted(self, output):
        valid = self.vectors["valid"]
        for value in (
            valid["password"],
            valid["encodedPassword"],
            valid["databaseUrl"],
            valid["directUrl"],
        ):
            self.assertNotIn(value, output)

    def test_topology_matches_shared_contract(self):
        self.assertEqual(DEFAULT_POOLER_HOST, self.topology["defaultPoolerHost"])
        self.assertEqual(RUNTIME_PORT, self.topology["runtimePort"])
        self.assertEqual(DATABASE, self.topology["database"])
        self.assertEqual(
            RUNTIME_QUERY,
            "&".join(
                f"{key}={value}" for key, value in self.topology["runtimeQuery"].items()
            ),
        )

    def test_exact_shared_vector_and_reserved_character_encoding(self):
        valid = self.vectors["valid"]
        self.assertEqual(
            create_database_url(valid["projectRef"], valid["password"]),
            valid["databaseUrl"],
        )

    def test_rejects_all_invalid_shared_values(self):
        valid = self.vectors["valid"]
        for project_ref in self.vectors["invalidProjectRefs"]:
            with self.subTest(project_ref=project_ref), self.assertRaises(
                SupabaseConfigError
            ):
                create_database_url(project_ref, valid["password"])
        for host in self.vectors["invalidPoolerHosts"]:
            with self.subTest(host=host), self.assertRaises(SupabaseConfigError):
                create_database_url(valid["projectRef"], valid["password"], host)

    def test_missing_and_conflicting_values_are_redacted(self):
        password = self.vectors["valid"]["password"]
        cases = [
            {},
            {
                "SUPABASE_PROJECT_REF": self.vectors["valid"]["projectRef"],
                "SUPABASE_DB_PASSWORD": password,
                "DATABASE_URL": "postgresql://different.example.invalid/value",
            },
        ]
        for index, environ in enumerate(cases):
            with self.subTest(case=index), self.assertRaises(
                SupabaseConfigError
            ) as raised:
                get_database_url(environ)
            rendered = str(raised.exception)
            self.assert_secrets_redacted(rendered)
            self.assertNotIn("postgresql://", rendered)

    def test_equal_legacy_value_is_allowed(self):
        valid = self.vectors["valid"]
        self.assertEqual(
            get_database_url(
                {
                    "SUPABASE_PROJECT_REF": valid["projectRef"],
                    "SUPABASE_DB_PASSWORD": valid["password"],
                    "DATABASE_URL": valid["databaseUrl"],
                }
            ),
            valid["databaseUrl"],
        )


class WorkerStartupTests(unittest.TestCase):
    def assert_secrets_redacted(self, output):
        valid = SupabaseEnvironmentTests.vectors["valid"]
        for value in (
            valid["password"],
            valid["encodedPassword"],
            valid["databaseUrl"],
            valid["directUrl"],
        ):
            self.assertNotIn(value, output)

    def _environment(self, include_canonical: bool) -> dict[str, str]:
        environ = os.environ.copy()
        for key in (
            "SUPABASE_PROJECT_REF",
            "SUPABASE_DB_PASSWORD",
            "SUPABASE_DB_POOLER_HOST",
            "DATABASE_URL",
            "DIRECT_URL",
        ):
            environ.pop(key, None)
        if include_canonical:
            valid = SupabaseEnvironmentTests.vectors["valid"]
            environ.update(
                SUPABASE_PROJECT_REF=valid["projectRef"],
                SUPABASE_DB_PASSWORD=valid["password"],
            )
        return environ

    def test_all_process_types_validate_before_startup(self):
        modules = {
            "worker": "paidsoon_worker.celery_app",
            "beat": "paidsoon_worker.celery_app",
            "web": "paidsoon_worker.http_server",
        }
        for process_type, module in modules.items():
            with self.subTest(process_type=process_type):
                result = subprocess.run(
                    [sys.executable, "-c", f"import {module}"],
                    env=self._environment(include_canonical=False),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                output = result.stdout + result.stderr
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("SUPABASE_PROJECT_REF_MISSING", output)
                self.assertNotIn("postgresql://", output)
                self.assert_secrets_redacted(output)

    def test_startup_validation_failure_redacts_canonical_and_derived_secrets(self):
        valid = SupabaseEnvironmentTests.vectors["valid"]
        environ = self._environment(include_canonical=True)
        environ.update(
            SUPABASE_DB_POOLER_HOST="invalid.pooler.example.com",
            DATABASE_URL=valid["databaseUrl"],
            DIRECT_URL=valid["directUrl"],
        )
        result = subprocess.run(
            [sys.executable, "-c", "import paidsoon_worker.celery_app"],
            env=environ,
            capture_output=True,
            text=True,
            check=False,
        )
        output = result.stdout + result.stderr

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SUPABASE_POOLER_HOST_INVALID", output)
        self.assert_secrets_redacted(output)

    def test_process_modules_accept_fake_canonical_inputs_without_connecting(self):
        for module in (
            "paidsoon_worker.celery_app",
            "paidsoon_worker.http_server",
        ):
            with self.subTest(module=module):
                result = subprocess.run(
                    [sys.executable, "-c", f"import {module}"],
                    env=self._environment(include_canonical=True),
                    capture_output=True,
                    text=True,
                    check=False,
                )
                output = result.stdout + result.stderr
                self.assertEqual(result.returncode, 0, output)
                self.assert_secrets_redacted(output)
                self.assertNotIn("postgresql://", output)