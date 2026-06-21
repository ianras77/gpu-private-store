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
