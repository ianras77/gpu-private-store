from typing import Any

from services.search_client import client


async def search_searxng(
    query: str,
    limit: int = 10,
    *,
    include_debug: bool = False,
    categories: str | None = None,
    engines: str | None = None,
) -> list[dict[str, Any]] | dict[str, Any]:
    response = await client.search(
        query=query,
        limit=limit,
        categories=categories,
        engines=engines,
    )

    if include_debug:
        return {"results": response.results, "debug": response.debug}
    return response.results
