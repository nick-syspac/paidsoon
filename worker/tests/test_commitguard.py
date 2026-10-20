"""Actual Railway extension, no Redis, network or external database permitted."""
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_PROJECT_REF", "abcdefghijklmnopqrst")
os.environ.setdefault("SUPABASE_DB_PASSWORD", "test-only-password")

from paidsoon_worker import commitguard
from paidsoon_worker.celery_app import app
from paidsoon_worker.config import Config

REPAIR_DONE = {"date": "2026-10-19", "accountingCursor": None, "accountingDone": True,
               "importCursor": None, "importDone": True}


class CommitGuardTests(unittest.TestCase):
    def setUp(self):
        self.network = patch("httpx.post", side_effect=AssertionError("network forbidden")).start()
        self.db = patch("psycopg.connect", side_effect=AssertionError("external DB forbidden")).start()
        self.broker = patch.object(app, "send_task", side_effect=AssertionError("Redis forbidden")).start()
        self.addCleanup(patch.stopall)
        commitguard._daily_cursor = None
        commitguard._repair_state = None

    def test_release_gate_does_not_register_or_dispatch_schedule(self):
        self.assertFalse(Config.COMMITGUARD_DISPATCH_ENABLED)
        self.assertEqual(Config.COMMITGUARD_INTERVAL_SECONDS, 300)
        self.assertNotIn("dispatch-commitguard", app.conf.beat_schedule)
        with patch.object(commitguard, "call_internal_job") as api:
            self.assertEqual(commitguard.dispatch_commitguard.run(), 0)
            api.assert_not_called()

    def test_lost_enqueue_rediscovers_pending_and_independent_items_continue(self):
        jobs = [{"userId": "tenant", "workItemId": str(i), "kind": "detect"} for i in range(2)]
        result = {"jobs": jobs, "dailyCursor": None, "recovered": 0, "repairState": REPAIR_DONE}
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True), \
             patch.object(commitguard, "call_internal_job", return_value=result) as api, \
             patch.object(commitguard.commitguard_work_task, "delay", side_effect=[RuntimeError("private"), None, None, None]) as delay:
            self.assertEqual(commitguard.dispatch_commitguard.run(), 1)
            self.assertEqual(commitguard.dispatch_commitguard.run(), 2)
            self.assertEqual(delay.call_count, 4)
            self.assertEqual(api.call_args.args, ("/api/internal/jobs/commitguard/dispatch", {
                "dailyCursor": None, "repairState": REPAIR_DONE}))
        self.network.assert_not_called(); self.db.assert_not_called(); self.broker.assert_not_called()

    def test_daily_keyset_cursor_progresses_and_restart_needs_no_redis_state(self):
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True), \
             patch.object(commitguard, "call_internal_job", side_effect=[
                 {"jobs": [], "dailyCursor": "tenant-100", "recovered": 0, "repairState": REPAIR_DONE},
                 {"jobs": [], "dailyCursor": None, "recovered": 0, "repairState": REPAIR_DONE}]) as api:
            commitguard.dispatch_commitguard.run(); commitguard.dispatch_commitguard.run()
            self.assertEqual(api.call_args.args[1], {"dailyCursor": "tenant-100", "repairState": REPAIR_DONE})
            self.assertIsNone(commitguard._daily_cursor)

    def test_repair_pages_continue_across_ticks_and_completed_day_is_retained(self):
        page = {**REPAIR_DONE, "accountingCursor": "source-100", "accountingDone": False}
        finished = {**REPAIR_DONE, "accountingCursor": "source-101"}
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True), \
             patch.object(commitguard, "call_internal_job", side_effect=[
                 {"jobs": [], "dailyCursor": None, "recovered": 0, "repairState": page},
                 {"jobs": [], "dailyCursor": None, "recovered": 0, "repairState": finished},
                 {"jobs": [], "dailyCursor": None, "recovered": 0, "repairState": finished}]) as api:
            for _ in range(3):
                commitguard.dispatch_commitguard.run()
            self.assertEqual([call.args[1]["repairState"] for call in api.call_args_list],
                             [None, page, finished])
        self.network.assert_not_called(); self.db.assert_not_called(); self.broker.assert_not_called()

    def test_failed_scan_preserves_repair_cursor_and_restart_resets_hint_only(self):
        commitguard._repair_state = REPAIR_DONE
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True), \
             patch.object(commitguard, "call_internal_job", side_effect=RuntimeError("safe")):
            with self.assertRaises(RuntimeError):
                commitguard.dispatch_commitguard.run()
            self.assertEqual(commitguard._repair_state, REPAIR_DONE)
        commitguard._repair_state = None
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True), \
             patch.object(commitguard, "call_internal_job", return_value={
                 "jobs": [], "dailyCursor": None, "recovered": 0, "repairState": REPAIR_DONE}) as api:
            commitguard.dispatch_commitguard.run()
            self.assertIsNone(api.call_args.args[1]["repairState"])

    def test_deferred_is_not_completion_or_celery_retry(self):
        deferred = {"status": "deferred", "reason": "evaluation_pipeline_pending"}
        with patch.object(commitguard, "call_internal_job", return_value=deferred) as api:
            self.assertEqual(commitguard.commitguard_work_task.run("tenant", "work", "evaluate"), deferred)
            api.assert_called_once_with("/api/internal/jobs/commitguard", {
                "userId": "tenant", "workItemId": "work", "kind": "evaluate"})
        self.assertFalse(hasattr(commitguard.commitguard_work_task, "autoretry_for"))

    def test_execution_failure_is_not_broker_owned_retry(self):
        with patch.object(commitguard, "call_internal_job", side_effect=RuntimeError("safe")):
            with self.assertRaises(RuntimeError):
                commitguard.commitguard_work_task.run("tenant", "work", "detect")

    def test_out_of_order_items_delegate_identity_only_without_local_revision_or_source_suppression(self):
        # Actual TypeScript claim/boundary tests verify supersession and current
        # settings. Python must neither cache authorization nor discard an
        # independent ingestion identity because a newer evaluation arrived.
        results = [
            {"status": "completed"},
            {"status": "skipped", "reason": "superseded"},
            {"status": "completed"},
        ]
        with patch.object(commitguard, "call_internal_job", side_effect=results) as api:
            for work_id, kind, result in zip(
                ["new-evaluation", "old-evaluation", "independent-ingestion"],
                ["evaluate", "evaluate", "detect"], results,
            ):
                self.assertEqual(commitguard.commitguard_work_task.run("tenant", work_id, kind), result)
                self.assertEqual(api.call_args.args[1], {
                    "userId": "tenant", "workItemId": work_id, "kind": kind})
        self.network.assert_not_called(); self.db.assert_not_called(); self.broker.assert_not_called()