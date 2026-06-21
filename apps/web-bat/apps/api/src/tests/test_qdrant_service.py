import unittest
from unittest.mock import patch

import httpx

from services import qdrant_service


class _FakeResponse:
    def __init__(self, payload: dict | None = None, status_code: int = 200) -> None:
        self._payload = payload or {}
        self.status_code = status_code
        self.request = httpx.Request("GET", f"http://bat-qdrant:6333/collections/{qdrant_service.COLLECTION}")
        self.content = b"{}" if payload is not None else b""

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "qdrant error",
                request=self.request,
                response=httpx.Response(self.status_code),
            )


class _FakeClient:
    def __init__(self, *, get_response: _FakeResponse) -> None:
        self.get_response = get_response
        self.calls: list[tuple[str, str]] = []

    async def get(self, url: str, *, timeout: float) -> _FakeResponse:
        self.calls.append(("GET", url))
        return self.get_response

    async def put(self, url: str, *, json: dict, timeout: float) -> _FakeResponse:
        self.calls.append(("PUT", url))
        return _FakeResponse({"result": True}, status_code=200)


class QdrantServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        qdrant_service._collection_state.clear()

    def test_default_collection_name_matches_current_embedding_dimension(self) -> None:
        self.assertEqual(qdrant_service.COLLECTION, "source_chunks_v4096")

    async def test_ensure_collection_reuses_compatible_existing_collection_without_create_put(self) -> None:
        client = _FakeClient(
            get_response=_FakeResponse(
                {
                    "result": {
                        "config": {
                            "params": {
                                "vectors": {
                                    "size": 768,
                                    "distance": "Cosine",
                                }
                            }
                        }
                    }
                }
            )
        )

        with (
            patch("services.qdrant_service.get_shared_async_client", return_value=client),
            patch("services.qdrant_service.settings.qdrant_url", "http://bat-qdrant:6333"),
        ):
            ready = await qdrant_service.ensure_collection(768)

        self.assertTrue(ready)
        self.assertEqual(
            client.calls,
            [("GET", f"http://bat-qdrant:6333/collections/{qdrant_service.COLLECTION}")],
        )

    async def test_ensure_collection_creates_collection_when_missing(self) -> None:
        client = _FakeClient(get_response=_FakeResponse(status_code=404))

        with (
            patch("services.qdrant_service.get_shared_async_client", return_value=client),
            patch("services.qdrant_service.settings.qdrant_url", "http://bat-qdrant:6333"),
        ):
            ready = await qdrant_service.ensure_collection(768)

        self.assertTrue(ready)
        self.assertEqual(
            client.calls,
            [
                ("GET", f"http://bat-qdrant:6333/collections/{qdrant_service.COLLECTION}"),
                ("PUT", f"http://bat-qdrant:6333/collections/{qdrant_service.COLLECTION}"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
