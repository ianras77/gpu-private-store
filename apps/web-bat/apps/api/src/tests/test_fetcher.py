from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

import httpx

from services import fetcher


class _FakeAsyncClient:
    def __init__(self, responses):
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url):
        return self._responses.pop(0)


class FetcherRetryTests(IsolatedAsyncioTestCase):
    def setUp(self):
        fetcher._DOMAIN_BACKOFF_META.clear()
        fetcher._DOMAIN_BACKOFF_UNTIL.clear()

    async def test_no_retry_on_non_transient_http_status(self):
        original_retries = fetcher.settings.fetch_retries
        fetcher.settings.fetch_retries = 3
        calls = {"count": 0}

        def _client_factory(*args, **kwargs):  # noqa: ARG001
            request = httpx.Request("GET", "https://example.com/blocked")
            responses = [
                httpx.Response(
                    status_code=403,
                    request=request,
                    headers={"content-type": "text/html"},
                    text="<html><title>Forbidden</title><body>nope</body></html>",
                )
            ]
            calls["count"] += 1
            return _FakeAsyncClient(responses)

        try:
            with patch("services.fetcher.httpx.AsyncClient", side_effect=_client_factory):
                result = await fetcher.fetch_page("https://example.com/blocked")
            self.assertFalse(result["ok"])
            self.assertEqual(calls["count"], 1)
        finally:
            fetcher.settings.fetch_retries = original_retries

    async def test_retries_on_transient_http_status(self):
        original_retries = fetcher.settings.fetch_retries
        fetcher.settings.fetch_retries = 2
        call_state = {"idx": 0}
        request = httpx.Request("GET", "https://example.com/transient")
        responses = [
            httpx.Response(
                status_code=503,
                request=request,
                headers={"content-type": "text/html"},
                text="<html><title>Retry</title><body>retry</body></html>",
            ),
            httpx.Response(
                status_code=200,
                request=request,
                headers={"content-type": "text/html"},
                text="<html><title>OK</title><body>ready now</body></html>",
            ),
        ]

        def _client_factory(*args, **kwargs):  # noqa: ARG001
            class _SequencedClient:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, exc_type, exc, tb):
                    return False

                async def get(self, url):  # noqa: ARG002
                    idx = call_state["idx"]
                    call_state["idx"] += 1
                    return responses[idx]

            return _SequencedClient()

        async def _noop_sleep(seconds):  # noqa: ARG001
            return None

        try:
            with (
                patch("services.fetcher.httpx.AsyncClient", side_effect=_client_factory),
                patch("services.fetcher.asyncio.sleep", side_effect=_noop_sleep),
            ):
                result = await fetcher.fetch_page("https://example.com/transient")
            self.assertTrue(result["ok"])
            self.assertEqual(call_state["idx"], 2)
            self.assertGreater(len(result.get("text", "")), 0)
        finally:
            fetcher.settings.fetch_retries = original_retries

    async def test_fetch_strips_nul_bytes_from_payload(self):
        request = httpx.Request("GET", "https://example.com/nul")
        response = httpx.Response(
            status_code=200,
            request=request,
            headers={"content-type": "text/html"},
            text="<html><title>Nu\x00l</title><body>hi\x00 there</body></html>",
        )

        def _client_factory(*args, **kwargs):  # noqa: ARG001
            return _FakeAsyncClient([response])

        with patch("services.fetcher.httpx.AsyncClient", side_effect=_client_factory):
            result = await fetcher.fetch_page("https://example.com/nul")

        self.assertTrue(result["ok"])
        self.assertNotIn("\x00", result["html"])
        self.assertNotIn("\x00", result["text"])
        self.assertEqual(result["title"], "Nul")

    async def test_domain_backoff_short_circuits_repeat_blocked_host(self):
        request = httpx.Request("GET", "https://reuters.com/paywalled-story")
        calls = {"count": 0}

        def _client_factory(*args, **kwargs):  # noqa: ARG001
            calls["count"] += 1
            return _FakeAsyncClient(
                [
                    httpx.Response(
                        status_code=403,
                        request=request,
                        headers={"content-type": "text/html"},
                        text="<html><title>Forbidden</title><body>paywall</body></html>",
                    )
                ]
            )

        with patch("services.fetcher.httpx.AsyncClient", side_effect=_client_factory):
            first = await fetcher.fetch_page("https://reuters.com/paywalled-story")
            second = await fetcher.fetch_page("https://reuters.com/another-story")

        self.assertFalse(first["ok"])
        self.assertEqual(first["status_code"], 403)
        self.assertFalse(second["ok"])
        self.assertEqual(second["error"], "domain_backoff_active")
        self.assertEqual(second["status_code"], 403)
        self.assertEqual(second["suppressed_domain"], "reuters.com")
        self.assertEqual(calls["count"], 1)
