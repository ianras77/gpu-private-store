import unittest
from datetime import datetime, timedelta, timezone

from workers.healthcheck import evaluate_worker_heartbeat


class WorkerHealthcheckTests(unittest.TestCase):
    def test_recent_sleeping_worker_is_healthy(self) -> None:
        now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
        payload = {
            "status": "sleeping",
            "event": "cycle_complete",
            "timestamp": (now - timedelta(seconds=45)).isoformat(),
            "cycle_interval_seconds": 1800,
        }

        result = evaluate_worker_heartbeat(payload, now=now, stale_after_seconds=3600)

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "sleeping")
        self.assertEqual(result["age_seconds"], 45)

    def test_stale_worker_heartbeat_is_unhealthy(self) -> None:
        now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
        payload = {
            "status": "running",
            "event": "cycle_started",
            "timestamp": (now - timedelta(seconds=7201)).isoformat(),
            "cycle_interval_seconds": 1800,
        }

        result = evaluate_worker_heartbeat(payload, now=now, stale_after_seconds=7200)

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "heartbeat_stale")

    def test_timeout_worker_heartbeat_is_unhealthy(self) -> None:
        now = datetime(2026, 6, 5, 12, 0, tzinfo=timezone.utc)
        payload = {
            "status": "timeout",
            "event": "cycle_timeout",
            "timestamp": now.isoformat(),
            "cycle_interval_seconds": 1800,
        }

        result = evaluate_worker_heartbeat(payload, now=now, stale_after_seconds=7200)

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "worker_timeout")


if __name__ == "__main__":
    unittest.main()
