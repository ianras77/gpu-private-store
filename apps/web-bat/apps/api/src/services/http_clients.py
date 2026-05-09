from __future__ import annotations

import httpx

from config import settings

_shared_async_client: httpx.AsyncClient | None = None


def get_shared_async_client() -> httpx.AsyncClient:
    global _shared_async_client
    if _shared_async_client is None:
        max_connections = max(4, int(settings.outbound_http_max_connections))
        keepalive_connections = max(
            2,
            min(int(settings.outbound_http_max_keepalive_connections), max_connections),
        )
        _shared_async_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=max_connections,
                max_keepalive_connections=keepalive_connections,
            ),
            headers={"User-Agent": f"{settings.app_name}/1.0"},
        )
    return _shared_async_client
