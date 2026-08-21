import json
from pathlib import Path

from config import Settings


APP_ROOT = Path(__file__).resolve().parents[4]


def test_compose_defaults_use_reachable_rassymind_host_gateway() -> None:
    compose_text = (APP_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "rassymind-gateway:8080" not in compose_text
    assert "${RASSYMIND_BASE_URL:-http://host.docker.internal:8844}/api/chat" in compose_text
    assert "${RASSYMIND_BASE_URL:-http://host.docker.internal:8844}/api/embed" in compose_text
    assert compose_text.count("http://host.docker.internal:8844") >= 4
    assert compose_text.count("extra_hosts: *bat-host-gateway") >= 3


def test_worker_service_has_healthcheck() -> None:
    compose_text = (APP_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    start = compose_text.index("  bat-worker:")
    end = compose_text.index("\n\nnetworks:", start)
    worker_section = compose_text[start:end]

    assert "healthcheck:" in worker_section
    assert "python -m workers.healthcheck" in worker_section


def test_medium_term_content_machine_compose_defaults() -> None:
    compose_text = (APP_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "WORKER_CYCLE_MINUTES: ${WORKER_CYCLE_MINUTES:-15}" in compose_text
    assert "WORKER_MAX_CYCLE_SECONDS: ${WORKER_MAX_CYCLE_SECONDS:-7200}" in compose_text
    assert "PIPELINE_LOCK_TTL_SECONDS: ${PIPELINE_LOCK_TTL_SECONDS:-7200}" in compose_text
    assert "LLM_REQUEST_TIMEOUT_SECONDS: ${LLM_REQUEST_TIMEOUT_SECONDS:-180}" in compose_text
    assert "LLM_READINESS_INFERENCE_PROBE_ENABLED: ${LLM_READINESS_INFERENCE_PROBE_ENABLED:-true}" in compose_text
    assert "RESEARCH_QUERY_CONCURRENCY: ${RESEARCH_QUERY_CONCURRENCY:-8}" in compose_text
    assert "WRITER_THEME_CONCURRENCY: ${WRITER_THEME_CONCURRENCY:-2}" in compose_text
    assert "WRITER_THEME_TAKE_LIMIT: ${WRITER_THEME_TAKE_LIMIT:-4}" in compose_text
    assert "QUEEN_CURATION_LIMIT: ${QUEEN_CURATION_LIMIT:-12}" in compose_text
    assert "BACKLOG_PUBLISH_WINDOW_HOURS: ${BACKLOG_PUBLISH_WINDOW_HOURS:-120}" in compose_text
    assert "DAILY_PUBLISH_TARGET: ${DAILY_PUBLISH_TARGET:-5}" in compose_text
    assert "EDITORIAL_REWORK_PASSES_PER_CYCLE: ${EDITORIAL_REWORK_PASSES_PER_CYCLE:-3}" in compose_text
    assert "ANALYSIS_SOURCE_LIMIT: ${ANALYSIS_SOURCE_LIMIT:-10}" in compose_text
    assert "ANALYSIS_THEME_LIMIT: ${ANALYSIS_THEME_LIMIT:-8}" in compose_text
    assert "ANALYSIS_MAX_BRIEFS: ${ANALYSIS_MAX_BRIEFS:-18}" in compose_text
    assert "CAT_SECONDARY_MEMORY_RECALL_LIMIT: ${CAT_SECONDARY_MEMORY_RECALL_LIMIT:-12}" in compose_text
    assert "CAT_SECONDARY_MEMORY_MAX_CHARS: ${CAT_SECONDARY_MEMORY_MAX_CHARS:-2400}" in compose_text


def test_medium_term_content_machine_api_defaults(monkeypatch) -> None:
    for key in (
        "WORKER_CYCLE_MINUTES",
        "WORKER_MAX_CYCLE_SECONDS",
        "WORKER_HEARTBEAT_TTL_SECONDS",
        "PIPELINE_LOCK_TTL_SECONDS",
        "PIPELINE_STALE_AFTER_SECONDS",
        "LLM_REQUEST_TIMEOUT_SECONDS",
        "LLM_READINESS_INFERENCE_PROBE_ENABLED",
        "RESEARCH_QUERY_CONCURRENCY",
        "ANALYSIS_SOURCE_LIMIT",
        "ANALYSIS_THEME_LIMIT",
        "ANALYSIS_MAX_BRIEFS",
        "WRITER_THEME_CONCURRENCY",
        "WRITER_THEME_TAKE_LIMIT",
        "QUEEN_CURATION_LIMIT",
        "BACKLOG_PUBLISH_WINDOW_HOURS",
        "DAILY_PUBLISH_TARGET",
        "DAILY_PUBLISH_REWORK_MULTIPLIER",
        "EDITORIAL_REWORK_QUEUE_LIMIT",
        "EDITORIAL_REWORK_MAX_ATTEMPTS",
        "EDITORIAL_REWORK_PASSES_PER_CYCLE",
        "EDITORIAL_BACKLOG_PRUNE_LIMIT",
        "CAT_SECONDARY_MEMORY_RECALL_LIMIT",
        "CAT_SECONDARY_MEMORY_MAX_CHARS",
    ):
        monkeypatch.delenv(key, raising=False)

    settings = Settings(_env_file=None)

    assert settings.worker_cycle_minutes == 15
    assert settings.worker_max_cycle_seconds == 7200
    assert settings.worker_heartbeat_ttl_seconds == 9000
    assert settings.pipeline_lock_ttl_seconds == 7200
    assert settings.pipeline_stale_after_seconds == 7200
    assert settings.llm_request_timeout_seconds == 180
    assert settings.llm_readiness_inference_probe_enabled is True
    assert settings.research_query_concurrency == 8
    assert settings.analysis_source_limit == 10
    assert settings.analysis_theme_limit == 8
    assert settings.analysis_max_briefs == 18
    assert settings.writer_theme_concurrency == 2
    assert settings.writer_theme_take_limit == 4
    assert settings.queen_curation_limit == 12
    assert settings.backlog_publish_window_hours == 120
    assert settings.daily_publish_target == 5
    assert settings.daily_publish_rework_multiplier == 3
    assert settings.editorial_rework_queue_limit == 6
    assert settings.editorial_rework_max_attempts == 4
    assert settings.editorial_rework_passes_per_cycle == 3
    assert settings.editorial_backlog_prune_limit == 500
    assert settings.cat_secondary_memory_recall_limit == 12
    assert settings.cat_secondary_memory_max_chars == 2400


def test_app_versions_stay_in_sync() -> None:
    app_config = json.loads((APP_ROOT / "config.json").read_text(encoding="utf-8"))
    package_json = json.loads((APP_ROOT / "apps/web/package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((APP_ROOT / "apps/web/package-lock.json").read_text(encoding="utf-8"))

    assert package_json["version"] == app_config["version"]
    assert package_lock["version"] == app_config["version"]
    assert package_lock["packages"][""]["version"] == app_config["version"]


def test_runtime_docs_match_runtipi_defaults() -> None:
    readme_text = (APP_ROOT / "README.md").read_text(encoding="utf-8")
    deployment_text = (APP_ROOT / "docs/deployment.md").read_text(encoding="utf-8")
    docs_text = f"{readme_text}\n{deployment_text}"

    assert "WORKER_CYCLE_MINUTES=30" not in docs_text
    assert "PIPELINE_LOCK_TTL_SECONDS=3600" not in docs_text
    assert "PIPELINE_STALE_AFTER_SECONDS=1800" not in docs_text
    assert "RassyMind gateway" in docs_text
    assert "WORKER_CYCLE_MINUTES=15" in docs_text
    assert "PIPELINE_LOCK_TTL_SECONDS=7200" in docs_text
    assert "PIPELINE_STALE_AFTER_SECONDS=7200" in docs_text
