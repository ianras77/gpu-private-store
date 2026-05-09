CAT_ROLE_PIPELINE: list[dict] = [
    {
        "role": "researcher",
        "title": "Researcher",
        "description": "Runs hourly search sweeps, ingests pages, embeds evidence chunks, and refreshes themes.",
        "plugins": ["search_connector", "trend_engine", "voice_memory"],
        "outputs": ["query_plan", "opportunity_board", "source_quality_mix"],
    },
    {
        "role": "analyst",
        "title": "Analyst",
        "description": "Synthesizes fresh research into durable briefs, tone guidance, topic pressure, and source-role maps.",
        "plugins": ["trend_engine", "analysis_engine", "voice_memory"],
        "outputs": ["site_brief", "theme_briefs", "tone_distribution", "role_distribution"],
    },
    {
        "role": "writer",
        "title": "Writer",
        "description": "Turns active themes into lead stories, theme takes, and homepage draft structure.",
        "plugins": ["trend_engine", "homepage_editor", "voice_memory", "analysis_engine"],
        "outputs": ["story_slate", "homepage_angle", "launch_packets"],
    },
    {
        "role": "queen",
        "title": "Queen",
        "description": "Curates links, generates social voice variants, and prepares the public-facing drop from the analyzed package.",
        "plugins": ["analysis_engine", "social_voice", "homepage_editor", "voice_memory"],
        "outputs": ["publish_package", "social_rollout", "curated_links"],
    },
]


def get_role_pipeline() -> list[dict]:
    # Return a shallow copy so route handlers can safely enrich response data.
    return [dict(role) for role in CAT_ROLE_PIPELINE]
