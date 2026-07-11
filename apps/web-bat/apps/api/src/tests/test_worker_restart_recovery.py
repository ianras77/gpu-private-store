import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from workers import main as worker_main
from workers.jobs import PIPELINE_LOCK_KEY


class _FakeRedis:
    def __init__(self, token: str | None) -> None:
        self.token = token
        self.deleted: list[str] = []
        self.closed = False

    async def get(self, key: str) -> str | None:
        if key == PIPELINE_LOCK_KEY:
            return self.token
        return None

    async def delete(self, key: str) -> None:
        self.deleted.append(key)
        if key == PIPELINE_LOCK_KEY:
            self.token = None

    async def aclose(self) -> None:
        self.closed = True


class WorkerRestartRecoveryTests(unittest.IsolatedAsyncioTestCase):
    def test_progress_heartbeat_interval_is_bounded(self) -> None:
        self.assertEqual(worker_main._progress_heartbeat_interval_seconds(60), 30)
        self.assertEqual(worker_main._progress_heartbeat_interval_seconds(900), 300)
        self.assertEqual(worker_main._progress_heartbeat_interval_seconds(3600), 300)

    async def test_cycle_progress_heartbeat_writes_running_progress(self) -> None:
        writes: list[dict[str, object]] = []

        async def _fake_sleep(_seconds: int) -> None:
            if writes:
                raise asyncio.CancelledError()

        async def _fake_write_worker_heartbeat(**kwargs) -> None:
            writes.append(kwargs)

        with (
            patch("workers.main.asyncio.sleep", new=_fake_sleep),
            patch("workers.main._write_worker_heartbeat", new=_fake_write_worker_heartbeat),
        ):
            with self.assertRaises(asyncio.CancelledError):
                await worker_main._cycle_progress_heartbeat(
                    cycle_interval_seconds=90,
                    cycle_started_at="2026-07-11T16:00:00+00:00",
                    interval_seconds=1,
                )

        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["status"], "running")
        self.assertEqual(writes[0]["event"], "cycle_progress")
        self.assertEqual(writes[0]["cycle_interval_seconds"], 90)
        self.assertEqual(writes[0]["details"], {"cycle_started_at": "2026-07-11T16:00:00+00:00"})

    async def test_worker_startup_recovers_orphaned_worker_lock(self) -> None:
        redis_client = _FakeRedis("d495fad6-db2e-42a5-99b9-6c113ba958dc:worker")
        log_pipeline_event = AsyncMock()

        with (
            patch("workers.main.redis.from_url", return_value=redis_client),
            patch("workers.main._log_pipeline_event", log_pipeline_event),
            patch("workers.main.settings.redis_url", "redis://bat-redis:6379/0"),
        ):
            result = await worker_main._recover_orphaned_pipeline_lock(db=object())

        self.assertTrue(result["recovered"])
        self.assertEqual(redis_client.deleted, [PIPELINE_LOCK_KEY])
        self.assertTrue(redis_client.closed)
        log_pipeline_event.assert_awaited_once()
        self.assertEqual(log_pipeline_event.await_args.kwargs["action"], "cycle_failed")
        self.assertEqual(log_pipeline_event.await_args.kwargs["actor"], "worker")
        self.assertEqual(log_pipeline_event.await_args.kwargs["snapshot"]["reason"], "worker_restarted")

    async def test_worker_startup_leaves_admin_lock_alone(self) -> None:
        redis_client = _FakeRedis("d495fad6-db2e-42a5-99b9-6c113ba958dc:admin")
        log_pipeline_event = AsyncMock()

        with (
            patch("workers.main.redis.from_url", return_value=redis_client),
            patch("workers.main._log_pipeline_event", log_pipeline_event),
            patch("workers.main.settings.redis_url", "redis://bat-redis:6379/0"),
        ):
            result = await worker_main._recover_orphaned_pipeline_lock(db=object())

        self.assertFalse(result["recovered"])
        self.assertEqual(redis_client.deleted, [])
        self.assertTrue(redis_client.closed)
        log_pipeline_event.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
