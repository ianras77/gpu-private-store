MASTRA_ROLE_PIPELINE: list[dict] = [
    {
        "role": "researcher",
        "title": "Researcher",
        "description": "Runs hourly search sweeps, ingests pages, embeds evidence chunks, and refreshes themes.",
        "agents": ["bat-researcher"],
        "outputs": ["query_plan", "opportunity_board", "source_quality_mix"],
    },
    {
        "role": "analyst",
        "title": "Analyst",
        "description": "Synthesizes fresh research into durable briefs, tone guidance, topic pressure, and source-role maps.",
        "agents": ["bat-analyst"],
        "outputs": ["site_brief", "theme_briefs", "tone_distribution", "role_distribution"],
    },
    {
        "role": "writer",
        "title": "Writer",
        "description": "Turns active themes into lead stories, theme takes, and homepage draft structure.",
        "agents": ["bat-writer"],
        "outputs": ["story_slate", "homepage_angle", "launch_packets"],
    },
    {
        "role": "editor",
        "title": "Editor",
        "description": "Checks structure, voice, completeness, and evidence before a story can move to fact check.",
        "agents": ["bat-editor"],
        "outputs": ["editorial_review", "revision_request", "publish_ready_draft"],
    },
    {
        "role": "publisher",
        "title": "Publisher",
        "description": "Creates the atomic publication package and distributes the approved article to the existing site surfaces.",
        "agents": ["bat-publisher", "bat-social-editor"],
        "outputs": ["publication_package", "homepage_snapshot", "social_rollout"],
    },
]


def get_role_pipeline() -> list[dict]:
    # Return a shallow copy so route handlers can safely enrich response data.
    return [dict(role) for role in MASTRA_ROLE_PIPELINE]
