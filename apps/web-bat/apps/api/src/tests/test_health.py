import unittest
from datetime import datetime, timedelta

from routes.admin import _finalize_pipeline_cycle_status
from routes.health import (
    _build_cat_memory_probe_payload,
    _build_cat_message_probe_payload,
    _build_embedding_probe_payload,
    _extract_embedding_vector,
    _build_llm_probe_payload,
    _normalize_model_name,
    _ollama_tags_url,
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
        self.assertEqual(payload["options"]["num_predict"], 4)
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

    def test_pipeline_admin_marks_old_running_cycle_interrupted(self) -> None:
        cycle = {
            "status": "running",
            "last_event_at": datetime.utcnow() - timedelta(seconds=7200),
        }

        finalized = _finalize_pipeline_cycle_status(cycle)

        self.assertEqual(finalized["status"], "interrupted")
        self.assertTrue(finalized["interrupted"])
