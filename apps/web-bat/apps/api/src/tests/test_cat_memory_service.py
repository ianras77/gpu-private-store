from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import AsyncMock, patch

from services.cat_memory_service import (
    _build_source_memory_content,
    _extract_source_ids_from_recall_payload,
    _upsert_source_memory_point,
)


class CatMemoryServiceTests(unittest.TestCase):
    def test_build_source_memory_content_keeps_receipts_and_labels(self) -> None:
        source = SimpleNamespace(
            id=uuid.uuid4(),
            title="Judge demands answers on the administration's sanctions memo",
            source_name="Reuters",
            source_url="https://reuters.com/story",
            canonical_url="https://reuters.com/story",
            raw_text=(
                "White House aides insisted the memo was routine. "
                "A federal judge ordered the administration to explain why the sanctions memo contradicted its public line. "
                "The ruling gave officials until Friday to answer in court."
            ),
            meta={
                "source_host_label": "Reuters",
                "credibility_tier": "high",
                "quality_score": 6.4,
                "search_snippet": "The filing and the public line are drifting apart.",
            },
            published_at=None,
        )

        content = _build_source_memory_content(source, query_text="Trump sanctions memo latest 2026")

        self.assertIn("Title:", content)
        self.assertIn("Outlet: Reuters", content)
        self.assertIn("Evidence:", content)
        self.assertIn("judge ordered", content.lower())

    def test_extract_source_ids_from_recall_payload_dedupes_valid_uuids(self) -> None:
        source_id = uuid.uuid4()
        payload = {
            "vectors": {
                "collections": {
                    "declarative": [
                        {"metadata": {"source_id": str(source_id)}},
                        {"metadata": {"source_id": str(source_id)}},
                        {"metadata": {"source_id": "not-a-uuid"}},
                    ]
                }
            }
        }

        source_ids = _extract_source_ids_from_recall_payload(payload)

        self.assertEqual(source_ids, [source_id])


class CatMemoryServiceAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_upsert_source_memory_point_recreates_point_after_bad_put(self) -> None:
        put_response = SimpleNamespace(
            status_code=400,
            content=b'{"error":"bad point"}',
            json=lambda: {},
            raise_for_status=lambda: None,
        )
        post_response = SimpleNamespace(
            status_code=200,
            content=b'{"id":"new-point"}',
            json=lambda: {"id": "new-point"},
            raise_for_status=lambda: None,
        )
        client = SimpleNamespace(
            put=AsyncMock(return_value=put_response),
            post=AsyncMock(return_value=post_response),
        )

        with patch("services.cat_memory_service.get_shared_async_client", return_value=client):
            resolved = await _upsert_source_memory_point(
                "Title: Receipt",
                {"kind": "source_dossier", "source_id": str(uuid.uuid4())},
                point_id="stale-point",
            )

        self.assertEqual(resolved, "new-point")
        client.put.assert_awaited_once()
        client.post.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
