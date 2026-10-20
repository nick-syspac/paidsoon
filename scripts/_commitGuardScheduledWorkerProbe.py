"""9.4 stdio bridge ONLY: actual worker, no HTTP, PostgreSQL or Redis.

The parent executes actual Node internal handlers against its disposable clone.
No web server/Beat process is started and the code release gate stays false.
"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
os.environ.setdefault("SUPABASE_PROJECT_REF", "abcdefghijklmnopqrst")
os.environ.setdefault("SUPABASE_DB_PASSWORD", "synthetic-unused")

from paidsoon_worker import commitguard
from paidsoon_worker.celery_app import app
from paidsoon_worker.config import Config


def exchange(path, payload):
    print(json.dumps({"rpc": path, "payload": payload}), flush=True)
    answer = json.loads(sys.stdin.readline())
    if "error" in answer:
        raise AssertionError(answer["error"])
    return answer["result"]


def main():
    assert Config.COMMITGUARD_DISPATCH_ENABLED is False
    assert Config.COMMITGUARD_INTERVAL_SECONDS == 300
    assert "dispatch-commitguard" not in app.conf.beat_schedule
    captured = []
    with patch("httpx.post", side_effect=AssertionError("HTTP forbidden")) as http, \
         patch("psycopg.connect", side_effect=AssertionError("worker DB forbidden")) as db, \
         patch.object(app, "send_task", side_effect=AssertionError("broker forbidden")) as broker, \
         patch.object(commitguard, "call_internal_job", side_effect=exchange) as api:
        assert commitguard.dispatch_commitguard.run() == 0
        api.assert_not_called()
        # A process-local patch tests the existing branch, NOT activation/config.
        with patch.object(Config, "COMMITGUARD_DISPATCH_ENABLED", True):
            with patch.object(commitguard.commitguard_work_task, "delay", side_effect=RuntimeError("synthetic lost enqueue")) as lost:
                assert commitguard.dispatch_commitguard.run() == 0
                assert lost.call_count > 0
            with patch.object(commitguard.commitguard_work_task, "delay", side_effect=lambda *args: captured.append(args)):
                queued = commitguard.dispatch_commitguard.run()
                assert queued == len(captured) and queued > 0
            # Exercise actual per-item task too, through the same real Node route.
            detection = next(args for args in captured if args[2] == "detect")
            result = commitguard.commitguard_work_task.run(*detection)
            assert result == {"status": "completed"}
        http.assert_not_called()
        db.assert_not_called()
        broker.assert_not_called()
    assert Config.COMMITGUARD_DISPATCH_ENABLED is False
    assert "dispatch-commitguard" not in app.conf.beat_schedule
    print(json.dumps({"done": True, "intervalSeconds": 300, "gate": False,
                      "captured": captured, "executed": detection, "result": result}), flush=True)


if __name__ == "__main__":
    main()