from typing import Any

import httpx

from config import settings
from services.structured_logging import get_logger, log_event

logger = get_logger("bat.x_connector")


def _x_auth_token() -> str:
    return settings.x_bearer_token.strip() or settings.x_access_token.strip()


async def search_x_recent(query: str, limit: int = 10) -> list[dict[str, Any]]:
    if not settings.x_enabled:
        log_event(logger, "x_search.skipped", query=query, reason="x_disabled")
        return []

    token = _x_auth_token()
    if not token:
        log_event(logger, "x_search.skipped", query=query, reason="missing_token")
        return []

    max_results = max(10, min(int(limit or settings.x_search_max_results), 100))
    url = f"{settings.x_api_base_url.rstrip('/')}/2/tweets/search/recent"
    params = {
        "query": f"({query}) lang:en -is:retweet -is:reply",
        "max_results": max_results,
        "tweet.fields": "created_at,lang,public_metrics,author_id",
    }
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
        rows = payload.get("data", [])
        if not isinstance(rows, list):
            return []
        log_event(logger, "x_search.success", query=query, returned=min(len(rows), limit))
        return [row for row in rows if isinstance(row, dict)][:limit]
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "x_search.failed", level=40, query=query, error=str(exc))
        return []
