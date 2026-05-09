import unittest
from unittest.mock import patch

import httpx

from services.embedding_service import embed_texts


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.request = httpx.Request("POST", "http://localhost:11435/api/embeddings")
        self.content = b"{}"

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("embedding error", request=self.request, response=httpx.Response(self.status_code))


class _FakeClient:
    def __init__(self, responses: list[_FakeResponse]) -> None:
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def post(self, url: str, *, json: dict, timeout: float) -> _FakeResponse:
        self.calls.append({"url": url, "json": json, "timeout": timeout})
        return self._responses.pop(0)


class EmbeddingServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_embed_texts_batches_and_dedupes_inputs(self) -> None:
        client = _FakeClient(
            [
                _FakeResponse(
                    {
                        "embeddings": [
                            [1.0, 2.0, 3.0],
                            [4.0, 5.0, 6.0],
                        ]
                    }
                )
            ]
        )

        with (
            patch("services.embedding_service.get_shared_async_client", return_value=client),
            patch("services.embedding_service.settings.embedding_batch_size", 4),
            patch("services.embedding_service.settings.embedding_api_url", "http://localhost:11435/api/embed"),
        ):
            vectors = await embed_texts(["alpha", "beta", "alpha"])

        self.assertEqual(len(client.calls), 1)
        self.assertEqual(client.calls[0]["json"]["input"], ["alpha", "beta"])
        self.assertEqual(
            vectors,
            [
                [1.0, 2.0, 3.0],
                [4.0, 5.0, 6.0],
                [1.0, 2.0, 3.0],
            ],
        )

    async def test_embed_texts_uses_single_prompt_calls_for_legacy_embeddings_endpoint(self) -> None:
        client = _FakeClient(
            [
                _FakeResponse({"embedding": [1.0, 2.0, 3.0]}),
                _FakeResponse({"embedding": [4.0, 5.0, 6.0]}),
            ]
        )

        with (
            patch("services.embedding_service.get_shared_async_client", return_value=client),
            patch("services.embedding_service.settings.embedding_batch_size", 4),
            patch("services.embedding_service.settings.embedding_api_url", "http://localhost:11435/api/embeddings"),
        ):
            vectors = await embed_texts(["alpha", "beta"])

        self.assertEqual(len(client.calls), 2)
        self.assertEqual(client.calls[0]["json"]["prompt"], "alpha")
        self.assertEqual(client.calls[1]["json"]["prompt"], "beta")
        self.assertEqual(vectors, [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])


if __name__ == "__main__":
    unittest.main()
