from __future__ import annotations

import asyncio
from time import monotonic
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from config import settings
from services.structured_logging import get_logger, log_event
from utils import normalize_whitespace

logger = get_logger("bat.fetcher")

ALLOWED_CONTENT_TYPES = (
    "text/html",
    "application/xhtml+xml",
)
TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}
DOMAIN_BACKOFF_SECONDS = {
    401: 6 * 60 * 60,
    403: 6 * 60 * 60,
    405: 2 * 60 * 60,
    429: 45 * 60,
}
_DOMAIN_BACKOFF_UNTIL: dict[str, float] = {}
_DOMAIN_BACKOFF_META: dict[str, dict[str, Any]] = {}


def _is_supported_content_type(value: str | None) -> bool:
    lowered = (value or "").lower()
    return any(token in lowered for token in ALLOWED_CONTENT_TYPES)


def _strip_nul_bytes(value: str | None) -> str:
    return (value or "").replace("\x00", "")


def _host(url: str | None) -> str:
    return (urlparse(url or "").netloc or "").lower()


def get_domain_backoff(url: str) -> dict[str, Any] | None:
    host = _host(url)
    if not host:
        return None

    until = _DOMAIN_BACKOFF_UNTIL.get(host)
    if not until:
        return None

    remaining_seconds = int(until - monotonic())
    if remaining_seconds <= 0:
        _DOMAIN_BACKOFF_UNTIL.pop(host, None)
        _DOMAIN_BACKOFF_META.pop(host, None)
        return None

    meta = dict(_DOMAIN_BACKOFF_META.get(host) or {})
    meta.update({"host": host, "remaining_seconds": remaining_seconds})
    return meta


def _clear_domain_backoff(url: str) -> None:
    host = _host(url)
    if not host:
        return
    _DOMAIN_BACKOFF_UNTIL.pop(host, None)
    _DOMAIN_BACKOFF_META.pop(host, None)


def _set_domain_backoff(url: str, *, status_code: int | None, reason: str) -> dict[str, Any] | None:
    host = _host(url)
    ttl_seconds = DOMAIN_BACKOFF_SECONDS.get(int(status_code or 0))
    if not host or not ttl_seconds:
        return None

    _DOMAIN_BACKOFF_UNTIL[host] = monotonic() + ttl_seconds
    payload = {
        "host": host,
        "status_code": int(status_code or 0),
        "reason": reason,
        "ttl_seconds": ttl_seconds,
    }
    _DOMAIN_BACKOFF_META[host] = payload
    return payload


async def fetch_page(url: str) -> dict[str, Any]:
    retries = max(1, int(settings.fetch_retries))
    timeout = max(5, int(settings.fetch_timeout_seconds))

    last_error = "fetch_failed"
    last_status_code: int | None = None
    domain_backoff = get_domain_backoff(url)
    if domain_backoff:
        log_event(
            logger,
            "fetch_page.domain_backoff_hit",
            level=30,
            url=url,
            **domain_backoff,
        )
        return {
            "ok": False,
            "url": url,
            "html": "",
            "text": "",
            "error": "domain_backoff_active",
            "status_code": domain_backoff.get("status_code"),
            "suppressed_domain": domain_backoff.get("host"),
            "retry_after_seconds": domain_backoff.get("remaining_seconds"),
        }

    for attempt in range(1, retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(url)

            content_type = response.headers.get("content-type", "")
            if response.status_code in TRANSIENT_STATUS_CODES:
                raise httpx.HTTPStatusError(
                    f"Transient status {response.status_code}",
                    request=response.request,
                    response=response,
                )

            response.raise_for_status()
            _clear_domain_backoff(url)
            if not _is_supported_content_type(content_type):
                log_event(
                    logger,
                    "fetch_page.unsupported_content_type",
                    level=30,
                    url=url,
                    content_type=content_type,
                    status_code=response.status_code,
                )
                return {
                    "ok": False,
                    "url": str(response.url),
                    "html": "",
                    "text": "",
                    "error": f"unsupported_content_type:{content_type or 'unknown'}",
                }

            raw_html = response.text
            html = _strip_nul_bytes(raw_html)
            if raw_html != html:
                log_event(
                    logger,
                    "fetch_page.sanitized_nul_bytes",
                    level=30,
                    url=url,
                    stripped_count=raw_html.count("\x00"),
                )
            soup = BeautifulSoup(html, "html.parser")

            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()

            text = normalize_whitespace(_strip_nul_bytes(soup.get_text(" ")))
            if len(text) > int(settings.fetch_max_text_chars):
                text = text[: int(settings.fetch_max_text_chars)]

            payload = {
                "ok": True,
                "url": str(response.url),
                "status_code": response.status_code,
                "content_type": content_type,
                "html": html,
                "text": text,
                "title": normalize_whitespace(_strip_nul_bytes(soup.title.text)) if soup.title and soup.title.text else None,
            }
            log_event(
                logger,
                "fetch_page.success",
                url=url,
                resolved_url=payload["url"],
                status_code=payload["status_code"],
                text_length=len(payload["text"] or ""),
                attempt=attempt,
            )
            return payload

        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            last_status_code = status_code
            last_error = str(exc)
            log_event(
                logger,
                "fetch_page.failed_attempt",
                level=40,
                url=url,
                attempt=attempt,
                retries=retries,
                status_code=status_code,
                error=last_error,
            )
            if status_code not in TRANSIENT_STATUS_CODES:
                break
            if attempt < retries:
                await asyncio.sleep(min(0.5 * attempt, 1.5))
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            log_event(
                logger,
                "fetch_page.failed_attempt",
                level=40,
                url=url,
                attempt=attempt,
                retries=retries,
                error=last_error,
            )
            if attempt < retries:
                await asyncio.sleep(min(0.5 * attempt, 1.5))

    domain_backoff = _set_domain_backoff(url, status_code=last_status_code, reason=last_error)
    if domain_backoff:
        log_event(
            logger,
            "fetch_page.domain_backoff_set",
            level=30,
            url=url,
            **domain_backoff,
        )

    log_event(logger, "fetch_page.failed", level=40, url=url, error=last_error)
    return {"ok": False, "url": url, "html": "", "text": "", "error": last_error, "status_code": last_status_code}
