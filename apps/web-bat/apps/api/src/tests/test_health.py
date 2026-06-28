import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from routes.admin import _finalize_pipeline_cycle_status
from routes.health import (
    _build_cat_memory_probe_payload,
    _build_cat_message_probe_payload,
    _build_embedding_probe_payload,
    _extract_embedding_vector,
    _build_llm_probe_payload,
    _normalize_model_name,
    _ollama_chat_check,
    _ollama_tags_url,
    _qdrant_vector_result_from_payload,
    _readiness_critical_ok,
    _llm_check,
)


class HealthRouteTests(unittest.TestCase):
    def test_ollama_tags_url_handles_chat_and_embedding_endpoints(self) -> None:
        self.assertEqual(_ollama_tags_url("http://localhost:11435/api/chat"), "http://localhost:11435/api/tags")
        self.assertEqual(
            _ollama_tags_url("http://localhost:11435/v1/chat/completions"),
            "http://localhost:11435/api/tags",
        )
        self.assertEqual(
            _ollama_tags_url("http://localhost:11435/api/embeddings"),
            "http://localhost:11435/api/tags",
        )

    def test_ollama_tags_url_returns_none_for_unknown_shapes(self) -> None:
        self.assertIsNone(_ollama_tags_url("http://localhost:11435/custom"))

    def test_model_name_normalization_ignores_latest_suffix(self) -> None:
        self.assertEqual(
            _normalize_model_name("qwen3-embedding:8b"),
            _normalize_model_name("qwen3-embedding:8b:latest"),
        )

    def test_native_ollama_chat_probe_payload_uses_runtime_safe_shape(self) -> None:
        payload = _build_llm_probe_payload("http://localhost:11435/api/chat", "qwen3.6:27b")

        self.assertEqual(payload["model"], "qwen3.6:27b")
        self.assertEqual(payload["stream"], False)
        self.assertEqual(payload["options"]["num_predict"], 128)
        self.assertEqual(payload["messages"][0]["content"], "Reply with exactly READY")

    def test_openai_chat_probe_payload_allows_reasoning_models_to_finish(self) -> None:
        payload = _build_llm_probe_payload("http://localhost:11435/v1/chat/completions", "rassy-smart")

        self.assertEqual(payload["model"], "rassy-smart")
        self.assertEqual(payload["stream"], False)
        self.assertEqual(payload["max_tokens"], 128)
        self.assertEqual(payload["messages"][0]["content"], "Reply with exactly READY")

    def test_cat_message_probe_payload_includes_service_user(self) -> None:
        payload = _build_cat_message_probe_payload("Reply with exactly CAT_READY", user_id="bat-health")

        self.assertEqual(payload["text"], "Reply with exactly CAT_READY")
        self.assertEqual(payload["user_id"], "bat-health")

    def test_cat_memory_probe_payload_targets_source_dossiers(self) -> None:
        payload = _build_cat_memory_probe_payload(query_text="Trump docket update", user_id="bat-health")

        self.assertEqual(payload["text"], "Trump docket update")
        self.assertEqual(payload["k"], 1)
        self.assertEqual(payload["metadata"]["kind"], "source_dossier")
        self.assertEqual(payload["user_id"], "bat-health")

    def test_embedding_probe_payload_uses_prompt_for_embeddings_endpoint(self) -> None:
        payload = _build_embedding_probe_payload("http://localhost:11435/api/embeddings", "qwen3-embedding:8b")

        self.assertEqual(payload["model"], "qwen3-embedding:8b")
        self.assertEqual(payload["prompt"], "healthcheck")

    def test_embedding_probe_payload_uses_input_for_embed_endpoint(self) -> None:
        payload = _build_embedding_probe_payload("http://localhost:11435/api/embed", "qwen3-embedding:8b")

        self.assertEqual(payload["model"], "qwen3-embedding:8b")
        self.assertEqual(payload["input"], "healthcheck")

    def test_extract_embedding_vector_reads_embed_response_shape(self) -> None:
        vector = _extract_embedding_vector({"embeddings": [[1.0, 2.0, 3.0]]})

        self.assertEqual(vector, [1.0, 2.0, 3.0])


    def test_readiness_allows_optional_search_connector_failure(self) -> None:
        checks = _healthy_readiness_checks()
        checks["search_connector"] = {"ok": False}

        self.assertTrue(
            _readiness_critical_ok(
                checks,
                cat_required=False,
                llm_required=True,
                embedding_required=True,
                search_required=False,
            )
        )

    def test_readiness_can_require_search_connector_when_configured(self) -> None:
        checks = _healthy_readiness_checks()
        checks["search_connector"] = {"ok": False}

        self.assertFalse(
            _readiness_critical_ok(
                checks,
                cat_required=False,
                llm_required=True,
                embedding_required=True,
                search_required=True,
            )
        )

    def test_readiness_treats_redis_as_core_dependency(self) -> None:
        checks = _healthy_readiness_checks()
        checks["redis"] = {"ok": False}

        self.assertFalse(
            _readiness_critical_ok(
                checks,
                cat_required=False,
                llm_required=True,
                embedding_required=True,
                search_required=False,
            )
        )

    def test_readiness_treats_qdrant_vector_shape_as_core_dependency(self) -> None:
        checks = _healthy_readiness_checks()
        checks["qdrant_vectors"] = {"ok": False, "reason": "vector_size_mismatch"}

        self.assertFalse(
            _readiness_critical_ok(
                checks,
                cat_required=False,
                llm_required=True,
                embedding_required=True,
                search_required=False,
            )
        )

    def test_qdrant_vector_payload_result_reports_collection_mismatch(self) -> None:
        payload = {
            "result": {
                "config": {
                    "params": {
                        "vectors": {
                            "size": 768,
                            "distance": "Cosine",
                        }
                    }
                },
                "points_count": 16532,
            }
        }

        result = _qdrant_vector_result_from_payload(
            payload,
            expected_vector_size=4096,
            collection="source_chunks_v4096",
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["collection"], "source_chunks_v4096")
        self.assertEqual(result["expected_vector_size"], 4096)
        self.assertEqual(result["existing_vector_size"], 768)
        self.assertEqual(result["reason"], "vector_size_mismatch")

    def test_pipeline_admin_marks_old_running_cycle_interrupted(self) -> None:
        cycle = {
            "status": "running",
            "last_event_at": datetime.utcnow() - timedelta(seconds=7200),
        }

        finalized = _finalize_pipeline_cycle_status(cycle)

        self.assertEqual(finalized["status"], "interrupted")
        self.assertTrue(finalized["interrupted"])


class HealthLlmReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_readiness_runs_inference_after_model_catalog_probe(self) -> None:
        model_check = {"ok": True, "probe": "ollama_tags", "model": "rassy-smart"}
        inference_check = {"ok": True, "probe": "chat_inference", "model": "rassy-smart"}

        with (
            patch("routes.health.settings.llm_api_url", "http://localhost:8844/api/chat"),
            patch("routes.health.settings.llm_model", "rassy-smart"),
            patch("routes.health.settings.llm_readiness_inference_probe_enabled", True),
            patch("routes.health._ollama_model_check", AsyncMock(return_value=model_check)) as model_probe,
            patch("routes.health._ollama_chat_check", AsyncMock(return_value=inference_check)) as chat_probe,
        ):
            result = await _llm_check()

        model_probe.assert_awaited_once_with("http://localhost:8844/api/chat", "rassy-smart")
        chat_probe.assert_awaited_once_with("http://localhost:8844/api/chat", "rassy-smart")
        self.assertTrue(result["ok"])
        self.assertEqual(result["probe"], "chat_inference")
        self.assertEqual(result["available_probe"], "ollama_tags")

    async def test_llm_readiness_can_skip_inference_probe_when_disabled(self) -> None:
        model_check = {"ok": True, "probe": "ollama_tags", "model": "rassy-smart"}

        with (
            patch("routes.health.settings.llm_api_url", "http://localhost:8844/api/chat"),
            patch("routes.health.settings.llm_model", "rassy-smart"),
            patch("routes.health.settings.llm_readiness_inference_probe_enabled", False),
            patch("routes.health._ollama_model_check", AsyncMock(return_value=model_check)),
            patch("routes.health._ollama_chat_check", AsyncMock()) as chat_probe,
        ):
            result = await _llm_check()

        chat_probe.assert_not_awaited()
        self.assertTrue(result["ok"])
        self.assertEqual(result["probe"], "ollama_tags")
        self.assertEqual(result["inference_probe"], "disabled")

    async def test_llm_chat_probe_sends_configured_bearer_token(self) -> None:
        class FakeResponse:
            status_code = 200

            def json(self) -> dict:
                return {"choices": [{"message": {"content": "READY"}}]}

            def raise_for_status(self) -> None:
                return None

        class FakeClient:
            def __init__(self) -> None:
                self.calls: list[dict] = []

            async def post(self, url: str, *, json: dict, headers: dict, timeout: float) -> FakeResponse:
                self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
                return FakeResponse()

        client = FakeClient()
        with (
            patch("routes.health.get_shared_async_client", return_value=client),
            patch("routes.health.settings.llm_api_key", "secret-token"),
            patch("routes.health.settings.llm_request_timeout_seconds", 180.0),
        ):
            result = await _ollama_chat_check("http://localhost:8844/v1/chat/completions", "rassy-smart")

        self.assertTrue(result["ok"])
        self.assertEqual(client.calls[0]["headers"]["Authorization"], "Bearer secret-token")


def _healthy_readiness_checks() -> dict[str, dict[str, bool]]:
    return {
        "database": {"ok": True},
        "redis": {"ok": True},
        "qdrant": {"ok": True},
        "qdrant_vectors": {"ok": True},
        "cheshire_cat": {"ok": True},
        "search_connector": {"ok": True},
        "embedding_api": {"ok": True},
        "llm_api": {"ok": True},
    }
