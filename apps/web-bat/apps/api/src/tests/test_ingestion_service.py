from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import uuid

from sqlalchemy.exc import IntegrityError

from services.ingestion_service import _commit_new_source, _sync_source_embeddings, ingest_query


class _FakeScalarResult:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self._rows = rows

    def all(self) -> list[SimpleNamespace]:
        return list(self._rows)


class _FakeExecuteResult:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self._rows = rows

    def scalars(self) -> _FakeScalarResult:
        return _FakeScalarResult(self._rows)


class _FakeDB:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self._rows = list(rows)
        self.added: list[object] = []
        self.execute_count = 0
        self.deleted_rows = False

    async def scalar(self, _query) -> int:
        return len(self._rows)

    async def execute(self, _query) -> _FakeExecuteResult:
        self.execute_count += 1
        if self.execute_count == 1:
            return _FakeExecuteResult(self._rows)
        self.deleted_rows = True
        self._rows = []
        return _FakeExecuteResult([])

    def add(self, item: object) -> None:
        self.added.append(item)


class _ScalarOnlyDB:
    async def scalar(self, _query) -> int:
        return 0


class _DuplicateInsertDB:
    def __init__(self, existing_row: SimpleNamespace) -> None:
        self._existing_row = existing_row
        self.added: list[object] = []
        self.commit_calls = 0
        self.rolled_back = False

    async def execute(self, _query) -> _FakeExecuteResult:
        return _FakeExecuteResult([self._existing_row])

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commit_calls += 1
        if self.commit_calls == 1:
            raise IntegrityError("insert into sources", {}, Exception("duplicate key"))

    async def rollback(self) -> None:
        self.rolled_back = True

    async def refresh(self, _item: object) -> None:
        return None


class IngestionEmbeddingSyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_sync_source_embeddings_reindexes_refresh_due_sources(self) -> None:
        source_id = uuid.uuid4()
        source = SimpleNamespace(
            id=source_id,
            meta={
                "embedding_needs_refresh": True,
                "embedding_model": "qwen3-embedding:8b",
                "embedding_collection": "source_chunks",
                "quality_score": 6.2,
                "current_news_eligible": True,
            },
            source_type="news",
            source_name="Reuters",
            source_url="https://reuters.com/story",
            canonical_url="https://reuters.com/story",
            title="Judge presses the administration on a sanctions memo",
            raw_text="A federal judge ordered the administration to explain the sanctions memo in court.",
            published_at=None,
        )
        chunks = [
            {"source_id": source_id, "chunk_index": 0, "chunk_text": "first chunk", "metadata": {"lane": "a"}},
            {"source_id": source_id, "chunk_index": 1, "chunk_text": "second chunk", "metadata": {"lane": "b"}},
        ]
        db = _FakeDB([SimpleNamespace(embedding_ref="old-1"), SimpleNamespace(embedding_ref="old-2")])
        sync_memory = AsyncMock(return_value={"status": "synced"})

        with (
            patch(
                "services.ingestion_service.prepare_chunk_points",
                new=AsyncMock(
                    return_value=(
                        ["new-1", "new-2"],
                        [
                            {"id": "new-1", "vector": [0.1, 0.2], "payload": {"source_id": str(source_id)}},
                            {"id": "new-2", "vector": [0.3, 0.4], "payload": {"source_id": str(source_id)}},
                        ],
                    )
                ),
            ),
            patch("services.ingestion_service.index_prepared_points", new=AsyncMock(return_value=True)),
            patch("services.ingestion_service.delete_points", new=AsyncMock(return_value=True)) as delete_points,
            patch("services.ingestion_service.sync_source_memory", new=sync_memory),
        ):
            result = await _sync_source_embeddings(
                db,
                source=source,
                chunks=chunks,
                normalized_query="Trump sanctions memo latest 2026",
                origin="web",
                content_changed=True,
            )

        self.assertTrue(db.deleted_rows)
        self.assertEqual(len(db.added), 2)
        self.assertEqual(result["status"], "embedded")
        self.assertFalse(result["needs_refresh"])
        self.assertEqual(result["stored_count"], 2)
        self.assertEqual(source.meta["embedding_status"], "embedded")
        self.assertFalse(source.meta["embedding_needs_refresh"])
        delete_points.assert_awaited_once_with(["old-1", "old-2"])
        sync_memory.assert_awaited_once()
        self.assertTrue(sync_memory.await_args.kwargs["allow_sync"])

    async def test_ingest_query_skips_hosts_under_domain_backoff(self) -> None:
        db = _ScalarOnlyDB()
        fetch_page = AsyncMock()

        with (
            patch(
                "services.ingestion_service.search_searxng",
                new=AsyncMock(
                    return_value={
                        "results": [
                            {
                                "url": "https://reuters.com/world/story",
                                "title": "Trump faces another foreign policy stumble",
                                "rank": 1,
                            }
                        ],
                        "debug": {"endpoint": "test"},
                    }
                ),
            ),
            patch(
                "services.ingestion_service.get_domain_backoff",
                return_value={"host": "reuters.com", "status_code": 403, "remaining_seconds": 1200},
            ),
            patch("services.ingestion_service.fetch_page", new=fetch_page),
            patch("services.ingestion_service.record_revision", new=AsyncMock()),
        ):
            summary = await ingest_query(db, query="Trump foreign policy latest 2026", limit=1)

        self.assertEqual(summary["result_count"], 1)
        self.assertEqual(summary["skipped_domain_backoff"], 1)
        self.assertEqual(summary["skipped_fetch_failed"], 0)
        fetch_page.assert_not_awaited()

    async def test_commit_new_source_recovers_existing_row_after_integrity_error(self) -> None:
        existing_row = SimpleNamespace(
            id=uuid.uuid4(),
            fetched_at=None,
            source_url="https://example.com/story",
            canonical_url="https://example.com/story",
            title="Story",
            hash="story-hash",
        )
        source = SimpleNamespace(id=uuid.uuid4())
        db = _DuplicateInsertDB(existing_row)

        result, inserted_new = await _commit_new_source(
            db,
            source=source,
            digest="story-hash",
            canonical_url="https://example.com/story",
            candidate_title="Story",
        )

        self.assertFalse(inserted_new)
        self.assertIs(result, existing_row)
        self.assertTrue(db.rolled_back)
        self.assertEqual(len(db.added), 1)


if __name__ == "__main__":
    unittest.main()
