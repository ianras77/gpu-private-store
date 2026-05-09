from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from config import settings
from services.structured_logging import get_logger, log_event
from utils import canonicalize_url, normalize_whitespace

logger = get_logger("bat.search")


@dataclass(slots=True)
class SearchResponse:
    results: list[dict[str, Any]]
    debug: dict[str, Any]


def _host(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def _is_blocked_url(
    url: str,
    *,
    blocked_domains: set[str],
    blocked_patterns: tuple[str, ...],
    blocked_file_extensions: tuple[str, ...],
) -> bool:
    host = _host(url)
    url_lower = (url or "").lower()
    if any(host == blocked or host.endswith(f".{blocked}") for blocked in blocked_domains):
        return True
    if any(pattern in url_lower for pattern in blocked_patterns):
        return True
    return any(url_lower.endswith(ext) for ext in blocked_file_extensions)


def _normalize_result(raw: dict[str, Any], *, rank: int) -> dict[str, Any] | None:
    url = str(raw.get("url") or raw.get("link") or "").strip()
    if not url:
        return None

    title = normalize_whitespace(str(raw.get("title") or ""))
    snippet = normalize_whitespace(str(raw.get("content") or raw.get("snippet") or ""))

    engine = raw.get("engine")
    if not engine and isinstance(raw.get("engines"), list) and raw["engines"]:
        engine = raw["engines"][0]

    return {
        "url": url,
        "canonical_url": canonicalize_url(url),
        "title": title,
        "snippet": snippet,
        "engine": str(engine or "unknown"),
        "published": raw.get("publishedDate") or raw.get("published"),
        "rank": rank,
        "raw": {
            "title": raw.get("title"),
            "url": raw.get("url") or raw.get("link"),
            "content": raw.get("content") or raw.get("snippet"),
            "engine": engine,
        },
    }


def _dedupe_and_filter(
    results: list[dict[str, Any]],
    blocked_domains: set[str],
    blocked_patterns: tuple[str, ...],
    blocked_file_extensions: tuple[str, ...],
    limit: int,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []

    for raw_idx, raw in enumerate(results, start=1):
        item = _normalize_result(raw, rank=raw_idx)
        if not item:
            continue
        if _is_blocked_url(
            item["url"],
            blocked_domains=blocked_domains,
            blocked_patterns=blocked_patterns,
            blocked_file_extensions=blocked_file_extensions,
        ):
            continue

        canonical = item["canonical_url"]
        if canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(item)
        if len(normalized) >= limit:
            break

    return normalized


class SearchClient:
    def __init__(
        self,
        *,
        base_url: str,
        search_path: str,
        output_format: str,
        timeout_seconds: int,
        retries: int,
        blocked_domains: set[str],
        blocked_patterns: tuple[str, ...],
        blocked_file_extensions: tuple[str, ...],
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.search_path = search_path
        self.output_format = output_format
        self.timeout_seconds = timeout_seconds
        self.retries = max(1, retries)
        self.blocked_domains = blocked_domains
        self.blocked_patterns = blocked_patterns
        self.blocked_file_extensions = blocked_file_extensions

    async def _request(self, *, params: dict[str, Any]) -> httpx.Response:
        url = f"{self.base_url}{self.search_path}"
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response

    async def search(
        self,
        *,
        query: str,
        limit: int = 10,
        categories: str | None = None,
        engines: str | None = None,
    ) -> SearchResponse:
        params: dict[str, Any] = {
            "q": query,
            "format": self.output_format,
        }
        if categories:
            params["categories"] = categories
        if engines:
            params["engines"] = engines

        last_error: str | None = None
        raw_payload: Any = None
        raw_results: list[dict[str, Any]] = []

        for attempt in range(1, self.retries + 1):
            try:
                response = await self._request(params=params)
                raw_payload = response.json()
                raw_results = raw_payload.get("results", []) if isinstance(raw_payload, dict) else []
                if not isinstance(raw_results, list):
                    raise ValueError("search payload missing results list")

                normalized = _dedupe_and_filter(
                    raw_results,
                    self.blocked_domains,
                    self.blocked_patterns,
                    self.blocked_file_extensions,
                    max(1, limit),
                )
                debug = {
                    "query": query,
                    "attempts": attempt,
                    "requested_limit": limit,
                    "raw_count": len(raw_results),
                    "returned_count": len(normalized),
                    "blocked_domains": sorted(self.blocked_domains),
                    "blocked_patterns": list(self.blocked_patterns),
                    "blocked_file_extensions": list(self.blocked_file_extensions),
                    "endpoint": f"{self.base_url}{self.search_path}",
                }
                log_event(logger, "search.success", query=query, attempt=attempt, returned=len(normalized), raw=len(raw_results))
                return SearchResponse(results=normalized, debug=debug)
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                log_event(
                    logger,
                    "search.attempt_failed",
                    level=40,
                    query=query,
                    attempt=attempt,
                    retries=self.retries,
                    error=last_error,
                )
                if attempt < self.retries:
                    await asyncio.sleep(min(0.6 * attempt, 2.0))

        debug = {
            "query": query,
            "attempts": self.retries,
            "requested_limit": limit,
            "raw_count": len(raw_results),
            "returned_count": 0,
            "endpoint": f"{self.base_url}{self.search_path}",
            "error": last_error or "search_failed",
        }
        if isinstance(raw_payload, dict):
            debug["raw_keys"] = sorted(raw_payload.keys())

        log_event(logger, "search.failed", level=40, query=query, error=last_error)
        return SearchResponse(results=[], debug=debug)


client = SearchClient(
    base_url=settings.searxng_base_url,
    search_path=settings.searxng_search_path,
    output_format=settings.searxng_default_format,
    timeout_seconds=max(5, int(settings.searxng_timeout_seconds)),
    retries=max(1, int(settings.searxng_retries)),
    blocked_domains=settings.blocked_domains,
    blocked_patterns=settings.blocked_url_patterns,
    blocked_file_extensions=settings.blocked_file_extensions,
)
