from __future__ import annotations

from datetime import datetime
import re
from typing import Any
import uuid

from config import settings
from models import Source
from services.http_clients import get_shared_async_client
from services.structured_logging import get_logger, log_event
from utils import normalize_whitespace, text_hash

logger = get_logger("bat.cat_memory")

CAT_DECLARATIVE_COLLECTION = "declarative"
SOURCE_DOSSIER_KIND = "source_dossier"
_STOPWORDS = {
    "about",
    "after",
    "amid",
    "analysis",
    "donald",
    "from",
    "latest",
    "live",
    "news",
    "today",
    "trump",
    "update",
    "updates",
    "white",
    "house",
}
_EVIDENCE_MARKERS = (
    "appeal",
    "briefing",
    "complaint",
    "court",
    "document",
    "filing",
    "hearing",
    "injunction",
    "judge",
    "lawsuit",
    "memo",
    "order",
    "press secretary",
    "retaliation",
    "ruling",
    "sanctions",
    "statement",
    "strike",
    "subpoena",
    "transcript",
)


def _clean_text(value: Any) -> str:
    return normalize_whitespace(str(value or ""))


def _query_terms(query_text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9']+", (query_text or "").lower())
        if len(token) >= 4 and token not in _STOPWORDS and not token.isdigit()
    ]


def _candidate_sentences(text: str) -> list[str]:
    normalized = _clean_text(text)
    if not normalized:
        return []
    sentences: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", normalized):
        cleaned = sentence.strip().strip("\"'` ")
        if len(cleaned) < 48:
            continue
        if len(cleaned) > 320:
            continue
        sentences.append(cleaned)
    return sentences


def _score_sentence(sentence: str, *, query_terms: list[str]) -> tuple[int, int, int, int]:
    lowered = sentence.lower()
    query_hits = sum(1 for term in query_terms if term in lowered)
    evidence_hits = sum(1 for marker in _EVIDENCE_MARKERS if marker in lowered)
    number_bonus = 1 if re.search(r"\b\d+\b", sentence) else 0
    length_bonus = max(0, 220 - abs(len(sentence) - 170))
    return (query_hits, evidence_hits, number_bonus, length_bonus)


def _select_evidence_lines(source: Source, *, query_text: str, limit: int = 3) -> list[str]:
    metadata = source.meta or {}
    query_terms = _query_terms(query_text)
    candidates = sorted(
        _candidate_sentences(source.raw_text or ""),
        key=lambda sentence: _score_sentence(sentence, query_terms=query_terms),
        reverse=True,
    )
    seen: set[str] = set()
    lines: list[str] = []

    for sentence in candidates:
        fingerprint = re.sub(r"[^a-z0-9]+", " ", sentence.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        if query_terms and not any(term in sentence.lower() for term in query_terms) and not any(
            marker in sentence.lower() for marker in _EVIDENCE_MARKERS
        ):
            continue
        seen.add(fingerprint)
        lines.append(sentence[:220])
        if len(lines) >= limit:
            return lines

    for fallback in (metadata.get("search_snippet"), source.title):
        cleaned = _clean_text(fallback)
        if len(cleaned) < 32:
            continue
        fingerprint = re.sub(r"[^a-z0-9]+", " ", cleaned.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        seen.add(fingerprint)
        lines.append(cleaned[:220])
        if len(lines) >= limit:
            break
    return lines[:limit]


def _build_source_memory_content(source: Source, *, query_text: str) -> str:
    metadata = source.meta or {}
    evidence = _select_evidence_lines(source, query_text=query_text, limit=3)
    source_label = _clean_text(metadata.get("source_host_label") or source.source_name or "News Desk")
    published = source.published_at.isoformat() if getattr(source, "published_at", None) else ""
    lines = [
        f"Title: {_clean_text(source.title) or 'Untitled'}",
        f"Outlet: {source_label}",
        f"URL: {_clean_text(source.canonical_url or source.source_url)}",
        f"Query: {_clean_text(query_text)}",
        f"Credibility: {_clean_text(metadata.get('credibility_tier') or 'unknown')}",
        f"Quality score: {float(metadata.get('quality_score') or 0):.2f}",
    ]
    if published:
        lines.append(f"Published at: {published}")
    snippet = _clean_text(metadata.get("search_snippet"))
    if snippet:
        lines.append(f"Search snippet: {snippet[:220]}")
    if evidence:
        lines.append("Evidence:")
        lines.extend(f"- {line}" for line in evidence)
    content = "\n".join(line for line in lines if line).strip()
    return content[: max(320, int(settings.cat_secondary_memory_max_chars))]


def _source_memory_fingerprint(source: Source, *, query_text: str) -> str:
    metadata = source.meta or {}
    parts = [
        str(source.id),
        _clean_text(source.title),
        _clean_text(source.canonical_url or source.source_url),
        _clean_text(query_text),
        _clean_text(metadata.get("credibility_tier")),
        str(round(float(metadata.get("quality_score") or 0), 2)),
        _clean_text(source.raw_text)[:1400],
    ]
    return text_hash("|".join(parts))


def _cat_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.cheshire_cat_api_key}"}


async def _upsert_source_memory_point(document: str, metadata: dict[str, Any], *, point_id: str | None) -> str | None:
    base_url = settings.cheshire_cat_url.rstrip("/")
    payload = {"content": document, "metadata": metadata}
    client = get_shared_async_client()
    timeout_seconds = max(6.0, float(settings.cat_request_timeout_seconds))

    if point_id:
        response = await client.put(
            f"{base_url}/memory/collections/{CAT_DECLARATIVE_COLLECTION}/points/{point_id}",
            json=payload,
            headers=_cat_headers(),
            timeout=timeout_seconds,
        )
        if response.status_code < 400:
            data = response.json() if response.content else {}
            return str(data.get("id") or point_id)
        if response.status_code not in {400, 404}:
            response.raise_for_status()
        point_id = None

    response = await client.post(
        f"{base_url}/memory/collections/{CAT_DECLARATIVE_COLLECTION}/points",
        json=payload,
        headers=_cat_headers(),
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    data = response.json() if response.content else {}
    resolved_point_id = str(data.get("id") or "").strip()
    return resolved_point_id or point_id


def _extract_source_ids_from_recall_payload(payload: Any) -> list[uuid.UUID]:
    if not isinstance(payload, dict):
        return []

    collections = ((payload.get("vectors") or {}).get("collections") or {}) if isinstance(payload, dict) else {}
    declarative_rows = collections.get(CAT_DECLARATIVE_COLLECTION) if isinstance(collections, dict) else []
    source_ids: list[uuid.UUID] = []
    seen: set[str] = set()

    for row in declarative_rows or []:
        metadata = row.get("metadata") if isinstance(row, dict) else {}
        candidate = str(metadata.get("source_id") or "").strip() if isinstance(metadata, dict) else ""
        try:
            source_id = uuid.UUID(candidate)
        except (TypeError, ValueError):
            continue
        if str(source_id) in seen:
            continue
        seen.add(str(source_id))
        source_ids.append(source_id)
    return source_ids


async def sync_source_memory(source: Source, *, query_text: str, allow_sync: bool = True) -> dict[str, Any]:
    metadata = source.meta or {}
    status_detail = "skipped"

    if not settings.cat_secondary_memory_enabled:
        status_detail = "disabled"
    elif not allow_sync:
        status_detail = "stale_source"
    elif str(getattr(source, "source_type", "") or "").lower() != "news":
        status_detail = "source_type_ignored"
    elif float(metadata.get("quality_score") or 0) < float(settings.cat_secondary_memory_min_quality):
        status_detail = "quality_too_low"
    elif not bool(metadata.get("current_news_eligible") or metadata.get("fundamental_view_candidate")):
        status_detail = "not_current_or_fundamental"
    else:
        fingerprint = _source_memory_fingerprint(source, query_text=query_text)
        point_id = str(metadata.get("cat_memory_point_id") or "").strip() or None
        if fingerprint == str(metadata.get("cat_memory_fingerprint") or "").strip() and point_id:
            source.meta = {
                **metadata,
                "cat_memory_status": "current",
                "cat_memory_kind": SOURCE_DOSSIER_KIND,
                "cat_memory_collection": CAT_DECLARATIVE_COLLECTION,
                "cat_memory_query": query_text,
                "cat_memory_updated_at": datetime.utcnow().isoformat(),
            }
            return {"status": "current", "point_id": point_id}

        document = _build_source_memory_content(source, query_text=query_text)
        point_metadata = {
            "kind": SOURCE_DOSSIER_KIND,
            "source_id": str(source.id),
            "source_url": _clean_text(source.canonical_url or source.source_url),
            "source_name": _clean_text(source.source_name or metadata.get("source_host_label") or "News Desk"),
            "title": _clean_text(source.title)[:220],
            "query": _clean_text(query_text)[:200],
            "credibility_tier": _clean_text(metadata.get("credibility_tier") or "unknown"),
            "quality_score": round(float(metadata.get("quality_score") or 0), 2),
            "source_kind": _clean_text(metadata.get("source_kind") or "other"),
        }

        try:
            resolved_point_id = await _upsert_source_memory_point(document, point_metadata, point_id=point_id)
            source.meta = {
                **metadata,
                "cat_memory_status": "synced",
                "cat_memory_kind": SOURCE_DOSSIER_KIND,
                "cat_memory_collection": CAT_DECLARATIVE_COLLECTION,
                "cat_memory_point_id": resolved_point_id,
                "cat_memory_fingerprint": fingerprint,
                "cat_memory_query": query_text,
                "cat_memory_synced_at": datetime.utcnow().isoformat(),
                "cat_memory_updated_at": datetime.utcnow().isoformat(),
            }
            log_event(
                logger,
                "cat_memory.sync.success",
                source_id=str(source.id),
                point_id=resolved_point_id,
                query=query_text,
            )
            return {"status": "synced", "point_id": resolved_point_id}
        except Exception as exc:  # noqa: BLE001
            source.meta = {
                **metadata,
                "cat_memory_status": "failed",
                "cat_memory_last_error": str(exc)[:240],
                "cat_memory_updated_at": datetime.utcnow().isoformat(),
            }
            log_event(
                logger,
                "cat_memory.sync.failed",
                level=30,
                source_id=str(source.id),
                query=query_text,
                error=str(exc),
            )
            return {"status": "failed", "error": str(exc)}

    source.meta = {
        **metadata,
        "cat_memory_status": status_detail,
        "cat_memory_updated_at": datetime.utcnow().isoformat(),
    }
    return {"status": status_detail}


async def recall_source_ids(query_text: str, limit: int) -> list[uuid.UUID]:
    if not settings.cat_secondary_memory_enabled or limit <= 0:
        return []

    requested = max(1, min(int(limit), int(settings.cat_secondary_memory_recall_limit)))
    payload = {
        "text": query_text,
        "k": requested,
        "metadata": {"kind": SOURCE_DOSSIER_KIND},
        "user_id": settings.cat_service_user_id,
    }

    try:
        client = get_shared_async_client()
        response = await client.post(
            f"{settings.cheshire_cat_url.rstrip('/')}/memory/recall",
            json=payload,
            headers=_cat_headers(),
            timeout=max(6.0, float(settings.cat_request_timeout_seconds)),
        )
        response.raise_for_status()
        source_ids = _extract_source_ids_from_recall_payload(response.json())
        log_event(logger, "cat_memory.recall.success", query=query_text, returned=len(source_ids))
        return source_ids[:requested]
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "cat_memory.recall.failed", level=30, query=query_text, error=str(exc))
        return []
