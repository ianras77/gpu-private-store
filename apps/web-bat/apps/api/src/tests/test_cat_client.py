import unittest
from unittest.mock import AsyncMock, patch

import httpx

from services.cat_client import (
    _build_request_headers,
    _build_llm_payload,
    _clamp_generation_tokens,
    _compose_prompt_payload,
    _extract_chat_completion_text,
    _generation_timeout_seconds,
    _is_retryable_llm_error,
    _looks_like_cat_not_configured,
    generate_with_cat,
)


class _RetryableAsyncClient:
    def __init__(self) -> None:
        self.calls = 0

    async def post(self, url: str, **kwargs):  # noqa: ANN003, ANN202
        self.calls += 1
        if self.calls == 1:
            raise httpx.RemoteProtocolError("server disconnected")
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "READY"}}]},
            request=request,
        )


class CatClientTests(unittest.TestCase):
    def test_cat_prompt_profile_trims_more_aggressively_than_llm(self) -> None:
        system_prompt = "System line. " * 500
        task_prompt = "Task line. " * 300
        context = "Context line. " * 600
        output_contract = "Output line. " * 200

        cat_prompt = _compose_prompt_payload(
            system_prompt=system_prompt,
            task_prompt=task_prompt,
            context=context,
            output_contract=output_contract,
            profile="cat",
            include_system_prompt=True,
        )
        llm_prompt = _compose_prompt_payload(
            system_prompt=system_prompt,
            task_prompt=task_prompt,
            context=context,
            output_contract=output_contract,
            profile="llm",
            include_system_prompt=False,
        )

        self.assertIn("Layer A: System Editorial Constitution", cat_prompt)
        self.assertNotIn("Layer A: System Editorial Constitution", llm_prompt)
        self.assertLess(len(cat_prompt), len(llm_prompt))
        self.assertLess(len(cat_prompt), 8000)
        self.assertIn("truncated for runtime safety", cat_prompt.lower())

    def test_native_ollama_payload_uses_keep_alive_and_options(self) -> None:
        payload = _build_llm_payload(
            url="http://localhost:11435/api/chat",
            system_prompt="System",
            prompt="User prompt",
            temperature=0.42,
            max_tokens=777,
        )

        self.assertEqual(payload["keep_alive"], "15m")
        self.assertEqual(payload["options"]["num_predict"], 777)
        self.assertEqual(payload["options"]["num_ctx"], 8192)
        self.assertEqual(payload["messages"][0]["role"], "system")

    def test_openai_compatible_payload_keeps_max_tokens_shape(self) -> None:
        payload = _build_llm_payload(
            url="http://localhost:11435/v1/chat/completions",
            system_prompt="System",
            prompt="User prompt",
            temperature=0.52,
            max_tokens=333,
        )

        self.assertEqual(payload["max_tokens"], 333)
        self.assertEqual(payload["temperature"], 0.52)
        self.assertEqual(payload["reasoning_effort"], "none")
        self.assertNotIn("keep_alive", payload)
        self.assertNotIn("options", payload)

    def test_chat_completion_extractor_does_not_publish_reasoning_as_content(self) -> None:
        payload = {
            "choices": [
                {
                    "message": {
                        "content": "",
                        "reasoning": "Thinking Process:\nAnalyze User Input\nDraft a plan before answering.",
                    }
                }
            ]
        }

        self.assertIsNone(_extract_chat_completion_text(payload))

    def test_llm_payload_accepts_model_override_for_challenger(self) -> None:
        payload = _build_llm_payload(
            url="http://localhost:11435/api/chat",
            system_prompt="System",
            prompt="User prompt",
            temperature=0.21,
            max_tokens=444,
            model_override="rassy-smart",
        )

        self.assertEqual(payload["model"], "rassy-smart")
        self.assertEqual(payload["options"]["num_predict"], 444)

    def test_request_headers_omit_blank_bearer_token(self) -> None:
        headers = _build_request_headers(api_key="  ", request_id="test-request")

        self.assertEqual(headers, {"X-Request-ID": "test-request"})

    def test_request_headers_include_nonblank_bearer_token(self) -> None:
        headers = _build_request_headers(api_key="secret-token", request_id="test-request")

        self.assertEqual(
            headers,
            {"X-Request-ID": "test-request", "Authorization": "Bearer secret-token"},
        )

    def test_cat_not_configured_detector_matches_runtime_error(self) -> None:
        self.assertTrue(_looks_like_cat_not_configured("You did not configure a Language Model. Do it in the settings!"))
        self.assertFalse(_looks_like_cat_not_configured("CAT_READY"))

    def test_retryable_llm_error_matches_busy_responses(self) -> None:
        request = httpx.Request("POST", "http://localhost:11435/api/chat")
        response = httpx.Response(503, request=request)
        error = httpx.HTTPStatusError("busy", request=request, response=response)

        self.assertTrue(_is_retryable_llm_error(error))

    def test_retryable_llm_error_rejects_bad_requests(self) -> None:
        request = httpx.Request("POST", "http://localhost:11435/api/chat")
        response = httpx.Response(400, request=request)
        error = httpx.HTTPStatusError("bad request", request=request, response=response)

        self.assertFalse(_is_retryable_llm_error(error))

    def test_generation_token_clamp_allows_long_form_budget(self) -> None:
        self.assertEqual(_clamp_generation_tokens(1600), 1600)
        self.assertEqual(_clamp_generation_tokens(4800), 2400)

    def test_generation_timeout_scales_with_requested_tokens(self) -> None:
        short_timeout = _generation_timeout_seconds(requested_tokens=260, base_timeout_seconds=30.0)
        long_timeout = _generation_timeout_seconds(requested_tokens=1800, base_timeout_seconds=30.0)

        self.assertGreater(long_timeout, short_timeout)
        self.assertGreaterEqual(short_timeout, 30.0)


class CatClientAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_waits_configured_backoff_before_retrying_rassymind_disconnect(self) -> None:
        client = _RetryableAsyncClient()
        sleep = AsyncMock()

        with (
            patch("services.cat_client.get_shared_async_client", return_value=client),
            patch("services.cat_client.asyncio.sleep", sleep),
            patch("services.cat_client.settings.cat_primary_enabled", False),
            patch("services.cat_client.settings.llm_api_url", "http://rassymind.test/v1/chat/completions"),
            patch("services.cat_client.settings.llm_api_key", ""),
            patch("services.cat_client.settings.llm_model", "rassy-smart"),
            patch("services.cat_client.settings.llm_request_timeout_seconds", 180.0),
            patch("services.cat_client.settings.llm_retry_backoff_seconds", 3.0),
        ):
            result = await generate_with_cat(
                task_prompt="Say ready.",
                context="",
                system_prompt="System",
                correlation_id="retry-test",
                max_tokens=64,
            )

        self.assertEqual(result, "READY")
        self.assertEqual(client.calls, 2)
        sleep.assert_awaited_once_with(3.0)
