import unittest
from contextlib import nullcontext
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from paidsoon_worker import db
from paidsoon_worker.db import _claim_key, _sanitize_conninfo


class SanitizeConninfoTests(unittest.TestCase):
    def test_strips_prisma_only_params(self):
        url = "postgresql://postgres.ref:pw@host:6543/postgres?pgbouncer=true&connection_limit=5"
        self.assertEqual(
            _sanitize_conninfo(url), "postgresql://postgres.ref:pw@host:6543/postgres"
        )

    def test_keeps_other_query_params(self):
        url = "postgresql://postgres.ref:pw@host:6543/postgres?sslmode=require&pgbouncer=true"
        self.assertEqual(
            _sanitize_conninfo(url),
            "postgresql://postgres.ref:pw@host:6543/postgres?sslmode=require",
        )

    def test_no_query_string_is_unchanged(self):
        url = "postgresql://postgres.ref:pw@host:6543/postgres"
        self.assertEqual(_sanitize_conninfo(url), url)

    def test_preserves_encoded_password(self):
        url = (
            "postgresql://postgres.ref:fake%3A%40%2F%3F%23%25%26%E9%9B%AA@"
            "host:6543/postgres?pgbouncer=true&connection_limit=1"
        )
        self.assertEqual(
            _sanitize_conninfo(url),
            "postgresql://postgres.ref:fake%3A%40%2F%3F%23%25%26%E9%9B%AA@host:6543/postgres",
        )


class ClaimKeyTests(unittest.TestCase):
    def test_reminder_email_claim_key_shape(self):
        scheduled_for = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
        key = _claim_key("invoice_123", "reminder_email", scheduled_for)
        self.assertEqual(key, "invoice_123:reminder_email:2026-08-03")

    def test_claim_key_is_stable_within_the_same_day(self):
        morning = datetime(2026, 8, 3, 1, 0, tzinfo=timezone.utc)
        evening = datetime(2026, 8, 3, 23, 0, tzinfo=timezone.utc)
        self.assertEqual(
            _claim_key("invoice_123", "reminder_email", morning),
            _claim_key("invoice_123", "reminder_email", evening),
        )

    def test_claim_key_differs_across_days(self):
        day_one = datetime(2026, 8, 3, tzinfo=timezone.utc)
        day_two = datetime(2026, 8, 4, tzinfo=timezone.utc)
        self.assertNotEqual(
            _claim_key("invoice_123", "reminder_email", day_one),
            _claim_key("invoice_123", "reminder_email", day_two),
        )


class SummarySelectorTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 17, 9, 30, tzinfo=timezone.utc)
        self.conn = MagicMock()
        self.conn.transaction.side_effect = nullcontext
        self.candidates = []
        self.claims = {}
        self.conn.execute.side_effect = self.execute
        self.connection_patch = patch.object(
            db, "get_conn", side_effect=lambda: nullcontext(self.conn)
        )
        self.connection_patch.start()
        self.addCleanup(self.connection_patch.stop)
        self.clock = patch.object(db, "datetime").start()
        self.addCleanup(patch.stopall)
        self.clock.now.return_value = self.now
        # Even a broken mock boundary must never open a live database connection.
        self.connect = patch.object(
            db.psycopg, "connect", side_effect=AssertionError("live DB forbidden")
        ).start()

    def execute(self, query, params=None):
        result = MagicMock()
        if query.lstrip().startswith("SELECT"):
            result.fetchall.return_value = self.candidates
        else:
            key = params["claim_key"]
            if key in self.claims:
                result.fetchone.return_value = None
            else:
                claim = {
                    "id": f"claim-{len(self.claims)}",
                    "entity_id": params["entity_id"],
                    "user_id": params["user_id"],
                }
                self.claims[key] = claim
                result.fetchone.return_value = claim
        return result

    def selector_query(self):
        return " ".join(self.conn.execute.call_args_list[0].args[0].split())

    def test_weekly_candidates_do_not_filter_raw_tier_status_or_grants(self):
        # These billing values excluded grant-backed tenants in the old SQL.
        # Candidate discovery deliberately does not resolve grant validity/features.
        profiles = [
            ("grant-essentials", "essentials", "canceled"),
            ("grant-control", "business_control", "paused"),
            ("grant-null", None, None),
            ("paid-pro", "business_pro", "active"),
            ("restricted", "small_business", "unpaid"),
        ]
        self.candidates = [{"user_id": user_id} for user_id, _, _ in profiles]

        claims = db.claim_due_weekly_debtor_summaries()

        self.assertEqual(
            self.selector_query(),
            'SELECT "userId" AS user_id FROM user_profiles ORDER BY "userId"',
        )
        self.assertEqual([claim["user_id"] for claim in claims],
                         [user_id for user_id, _, _ in profiles])
        self.assertEqual(claims, list(self.claims.values()))
        self.conn.transaction.assert_called_once_with()
        self.connect.assert_not_called()

    def test_digest_candidates_keep_enabled_settings_and_profile_binding_only(self):
        self.candidates = [{"user_id": "grant-essentials"}, {"user_id": "grant-null"}]

        claims = db.claim_due_owners_digests()

        self.assertEqual(
            self.selector_query(),
            'SELECT s.user_id FROM owners_digest_settings s '
            'JOIN user_profiles u ON u."userId" = s.user_id '
            'WHERE s.enabled = true AND s.email_enabled = true ORDER BY s.user_id',
        )
        self.assertEqual([claim["user_id"] for claim in claims],
                         ["grant-essentials", "grant-null"])
        self.assertEqual(claims, list(self.claims.values()))
        self.conn.transaction.assert_called_once_with()
        self.connect.assert_not_called()

    def test_existing_claim_keys_conflicts_and_return_shapes_are_preserved(self):
        for selector, workflow, period in [
            (db.claim_due_weekly_debtor_summaries, "debtor_summary", "2026-10-12"),
            (db.claim_due_owners_digests, "owners_digest_email", "2026-10-17"),
        ]:
            with self.subTest(workflow=workflow):
                self.claims.clear()
                self.conn.execute.reset_mock()
                self.candidates = [{"user_id": "tenant-a"}, {"user_id": "tenant-b"}]
                # ON CONFLICT must suppress existing queued/processing/delivered claims
                # alike: it is key uniqueness, not a status-dependent eligibility check.
                for status in ("queued", "processing", "sent"):
                    self.claims.clear()
                    self.claims[f"tenant-a:{workflow}:{period}"] = {"status": status}
                    claims = selector()
                    self.assertEqual(claims, [{
                        "id": "claim-1", "entity_id": "tenant-b", "user_id": "tenant-b",
                    }])
                    self.assertEqual(selector(), [])

                for call in self.conn.execute.call_args_list:
                    sql = " ".join(call.args[0].split())
                    if not sql.startswith("INSERT"):
                        continue
                    params = call.args[1]
                    self.assertIn(f"'{workflow}'", sql)
                    self.assertIn("'queued', now(), now(), now(), now()", sql)
                    self.assertIn("ON CONFLICT (claim_key) DO NOTHING", sql)
                    self.assertIn("RETURNING id, entity_id, user_id", sql)
                    self.assertEqual(params["entity_id"], params["user_id"])
                    self.assertEqual(params["claim_key"],
                                     f'{params["user_id"]}:{workflow}:{period}')

    def test_empty_candidates_create_no_claims(self):
        for selector in (db.claim_due_weekly_debtor_summaries, db.claim_due_owners_digests):
            with self.subTest(selector=selector.__name__):
                self.conn.execute.reset_mock()
                self.assertEqual(selector(), [])
                self.assertEqual(self.conn.execute.call_count, 1)


if __name__ == "__main__":
    unittest.main()
