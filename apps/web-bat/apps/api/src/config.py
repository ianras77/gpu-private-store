from datetime import datetime, timezone

from pydantic_settings import BaseSettings, SettingsConfigDict

CURRENT_YEAR = datetime.now(timezone.utc).year

DEFAULT_RESEARCH_DIRECTIVE = "\n".join(
    [
        f"Trump executive overreach latest {CURRENT_YEAR}",
        f"Trump legal collision latest {CURRENT_YEAR}",
        f"White House contradiction latest {CURRENT_YEAR}",
        f"federal judge blocks Trump administration action {CURRENT_YEAR}",
        f"cabinet official contradicts White House {CURRENT_YEAR}",
        f"Republican backlash Trump latest {CURRENT_YEAR}",
        f"Trump donor conflict latest {CURRENT_YEAR}",
        f"Trump immigration crackdown backlash {CURRENT_YEAR}",
        f"Trump tariff shock latest {CURRENT_YEAR}",
        f"White House Iran strike fallout {CURRENT_YEAR}",
    ]
)

DEFAULT_ANALYSIS_DIRECTIVE = "\n".join(
    [
        "Lead with the contradiction between message and consequence.",
        "Name the institutional stress point: court, agency, donor, cabinet, Congress, military, or market.",
        "Prefer documents, filings, transcripts, official votes, sanctions, and direct quotes.",
        "Surface who benefits, who absorbs the risk, and what makes this materially different from yesterday's outrage cycle.",
        "Pull one clean why-now line, one sharper pattern line, and one social hook with screenshot legs.",
    ]
)

DEFAULT_VOICE_BLUEPRINT = (
    "BAT personal-site voice. Make it feel like a real woman runs the room: polished, warm, expensive, and cutting. "
    "Current first, linked receipts, no filler, no generic throat-clearing, no cable-news sludge. "
    "Every piece should feel specific enough for a front page, sharp enough for a screenshot, and grounded enough to survive contact with the sources."
)

DEFAULT_LIVE_VIBE = (
    "Screenshot-ready dispatch voice: sharp, socially fluent, polished, anti-filler, and willing to sting once the receipts have earned it."
)

DEFAULT_QUERY_PACK = "|".join(
    [
        f"Trump executive order backlash {CURRENT_YEAR}",
        f"federal judge blocks Trump administration action {CURRENT_YEAR}",
        f"White House contradiction latest {CURRENT_YEAR}",
        f"Republican backlash Trump latest {CURRENT_YEAR}",
        f"cabinet official contradicts White House {CURRENT_YEAR}",
        f"Trump immigration crackdown backlash {CURRENT_YEAR}",
        f"Trump tariff shock latest {CURRENT_YEAR}",
        f"Trump donor conflict latest {CURRENT_YEAR}",
        f"Trump Iran war latest {CURRENT_YEAR}",
        f"White House Iran strike fallout {CURRENT_YEAR}",
        f"Congress war powers Trump Iran {CURRENT_YEAR}",
        f"oil prices Iran conflict Trump {CURRENT_YEAR}",
        f"Pentagon Middle East escalation latest {CURRENT_YEAR}",
    ]
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BlondesAgainstTrump"
    database_url: str = "postgresql+psycopg://bat:bat_password_change_me@localhost:5437/bat"
    database_pool_size: int = 20
    database_max_overflow: int = 20
    redis_url: str = "redis://localhost:6387/0"
    qdrant_url: str = "http://localhost:6337"

    searxng_base_url: str = "https://search.rasies.com"
    searxng_search_path: str = "/search"
    searxng_default_format: str = "json"
    searxng_timeout_seconds: int = 15
    searxng_retries: int = 2
    searxng_blocked_domains: str = (
        "yourdictionary.com|dictionary.com|wordreference.com|investopedia.com|"
        "gains.com|homedepot.com|lowes.com|ikea.com|menards.com|"
        "zillow.com|trulia.com|homes.com|redfin.com|realtor.com|movoto.com|"
        "wikipedia.org|"
        "econotimes.com|oilprice.com|"
        "townhall.com|breitbart.com|thegatewaypundit.com|"
        "dailycaller.com|newsmax.com|justthenews.com|redstate.com|dailywire.com|"
        "zerohedge.com|msn.com|yahoo.com"
    )
    searxng_blocked_url_patterns: str = (
        "/dictionary/|/definitions/|/privacy-policy|/court-rentals|/forums/showthread|/wp-content/uploads/"
    )
    searxng_blocked_file_extensions: str = ".pdf|.doc|.docx|.ppt|.pptx"

    cheshire_cat_url: str = "http://localhost:1866"
    cheshire_cat_api_key: str = "change_me"
    cat_primary_enabled: bool = False
    cat_service_user_id: str = "bat-secondary-memory"
    cat_request_timeout_seconds: float = 45.0
    cat_health_timeout_seconds: float = 12.0
    cat_secondary_memory_enabled: bool = True
    cat_secondary_memory_min_quality: float = 4.8
    cat_secondary_memory_recall_limit: int = 12
    cat_secondary_memory_max_chars: int = 2400

    llm_api_url: str = "http://host.docker.internal:8844/api/chat"
    llm_api_key: str = ""
    llm_model: str = "rassy-mind"
    llm_challenger_model: str = "rassy-mind"
    llm_request_timeout_seconds: float = 180.0
    llm_retry_backoff_seconds: float = 3.0
    llm_readiness_inference_probe_enabled: bool = True
    ollama_num_ctx: int = 8192
    ollama_repeat_last_n: int = 96
    ollama_repeat_penalty: float = 1.12
    ollama_keep_alive: str = "15m"

    embedding_api_url: str = "http://host.docker.internal:8844/api/embed"
    embedding_api_key: str = ""
    embedding_model: str = "rassy-embed"
    embedding_allow_fallback: bool = False
    embedding_request_timeout_seconds: float = 12.0
    embedding_request_retries: int = 1
    embedding_batch_size: int = 8
    embedding_chunk_size: int = 1000
    embedding_chunk_overlap: int = 120
    embedding_max_chunks_per_source: int = 6
    fetch_timeout_seconds: int = 20
    fetch_retries: int = 2
    fetch_max_text_chars: int = 30000

    enable_manual_review: bool = True
    auto_publish: bool = False
    auto_publish_social: bool = False
    worker_cycle_minutes: int = 15
    worker_min_cycle_seconds: int = 30
    worker_max_cycle_seconds: int = 7200
    worker_heartbeat_ttl_seconds: int = 9000
    worker_heartbeat_key: str = "bat:worker:heartbeat"
    search_connector_required: bool = False
    pipeline_lock_ttl_seconds: int = 7200
    pipeline_stale_after_seconds: int = 7200
    research_query_concurrency: int = 8
    research_x_query_concurrency: int = 4
    analysis_theme_concurrency: int = 4
    writer_theme_concurrency: int = 2
    social_dispatch_concurrency: int = 4
    # Keep the writer stage small enough to reach Princess/Queen in one cycle;
    # each long-form model call is expensive and an oversized batch starves
    # publication indefinitely.
    writer_theme_take_limit: int = 4
    queen_curation_limit: int = 12

    x_enabled: bool = False
    x_dry_run: bool = True
    x_api_base_url: str = "https://api.x.com"
    x_bearer_token: str = ""
    x_access_token: str = ""
    x_search_max_results: int = 10
    x_research_enabled: bool = True
    direct_publish_default: bool = True
    default_research_directive: str = DEFAULT_RESEARCH_DIRECTIVE
    default_analysis_directive: str = DEFAULT_ANALYSIS_DIRECTIVE
    default_voice_blueprint: str = DEFAULT_VOICE_BLUEPRINT
    default_live_vibe: str = DEFAULT_LIVE_VIBE

    social_publisher_url: str = "http://localhost:8117"
    retrieval_max_sources: int = 10
    retrieval_max_themes: int = 6
    retrieval_max_trends: int = 8
    analysis_source_limit: int = 10
    analysis_theme_limit: int = 8
    analysis_recent_editorial_limit: int = 16
    analysis_max_source_roles: int = 4
    analysis_max_briefs: int = 18
    retrieval_min_quality_score: float = 4.6
    retrieval_max_source_age_days: int = 14
    current_news_min_year: int = CURRENT_YEAR
    current_news_max_age_days: int = 7
    current_news_explicit_min_quality_score: float = 4.6
    current_news_undated_min_quality_score: float = 6.2
    fundamental_view_min_quality_score: float = 7.6
    backlog_publish_window_hours: int = 120
    daily_publish_target: int = 5
    daily_publish_rework_multiplier: int = 3
    editorial_rework_queue_limit: int = 6
    editorial_rework_max_attempts: int = 4
    editorial_rework_passes_per_cycle: int = 3
    editorial_backlog_prune_limit: int = 500
    ingestion_min_quality_score: float = 3.0
    ingestion_min_text_length: int = 220
    generation_min_grounded_sources: int = 3
    outbound_http_max_connections: int = 40
    outbound_http_max_keepalive_connections: int = 20

    default_query_pack: str = DEFAULT_QUERY_PACK

    @property
    def query_pack(self) -> list[str]:
        return [q.strip() for q in self.default_query_pack.split("|") if q.strip()]

    @property
    def blocked_domains(self) -> set[str]:
        return {domain.strip().lower() for domain in self.searxng_blocked_domains.split("|") if domain.strip()}

    @property
    def blocked_url_patterns(self) -> tuple[str, ...]:
        return tuple(pattern.strip().lower() for pattern in self.searxng_blocked_url_patterns.split("|") if pattern.strip())

    @property
    def blocked_file_extensions(self) -> tuple[str, ...]:
        return tuple(ext.strip().lower() for ext in self.searxng_blocked_file_extensions.split("|") if ext.strip())


settings = Settings()
