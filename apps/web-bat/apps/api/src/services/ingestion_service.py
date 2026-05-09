from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any
from urllib.parse import urlparse
import uuid

from dateutil import parser as date_parser
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Source, SourceEmbedding
from services.cat_memory_service import sync_source_memory
from services.embedding_service import index_prepared_points, prepare_chunk_points, upsert_chunk_vectors
from services.fetcher import fetch_page, get_domain_backoff
from services.qdrant_service import COLLECTION, delete_points
from services.revision_service import record_revision
from services.search_connector import search_searxng
from services.source_policy import current_news_assessment, has_bat_focus, parse_datetime, source_kind, source_label
from services.structured_logging import get_logger, log_event
from services.x_connector import search_x_recent
from utils import canonicalize_url, chunk_text, normalize_whitespace, text_hash

logger = get_logger("bat.ingestion")

QUERY_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "have",
    "after",
    "into",
    "amid",
    "over",
    "about",
    "what",
    "week",
    "today",
    "latest",
    "live",
    "news",
}
POLITICAL_SIGNALS = {
    "trump",
    "donald trump",
    "white house",
    "administration",
    "gop",
    "republican",
    "maga",
    "congress",
    "president",
    "cabinet",
    "federal judge",
    "supreme court",
    "executive order",
    "doj",
    "senate",
    "house",
    "pentagon",
    "state department",
    "national security",
    "war powers",
    "sanctions",
    "iran",
    "israel",
    "middle east",
    "military",
}
POLITICAL_QUERY_MARKERS = {
    "trump",
    "administration",
    "white house",
    "maga",
    "republican",
    "gop",
    "court",
    "judge",
    "cabinet",
    "congress",
    "pentagon",
    "state department",
    "national security",
    "war powers",
    "sanctions",
}
FOREIGN_POLICY_QUERY_MARKERS = {
    "iran",
    "tehran",
    "israel",
    "israeli",
    "gaza",
    "middle east",
    "strait of hormuz",
    "oil prices",
    "missile",
    "strike",
    "airstrike",
    "ceasefire",
    "retaliation",
    "military",
    "troops",
    "nuclear",
    "diplomacy",
}
LOW_VALUE_MARKERS = {
    "home depot",
    "lowes",
    "kitchen cabinets",
    "cabinet warehouse",
    "shop",
    "buy now",
}

HIGH_CREDIBILITY_HOSTS = {
    "apnews.com",
    "reuters.com",
    "nytimes.com",
    "washingtonpost.com",
    "wsj.com",
    "bbc.com",
    "bbc.co.uk",
    "npr.org",
    "abcnews.go.com",
    "abcnews.com",
    "nbcnews.com",
    "cbsnews.com",
    "cnn.com",
    "politico.com",
    "propublica.org",
    "usatoday.com",
    "theguardian.com",
    "bloomberg.com",
    "time.com",
    "theatlantic.com",
    "foxnews.com",
}
LOW_CREDIBILITY_HOSTS = {
    "americanthinker.com",
    "breitbart.com",
    "dailycaller.com",
    "dailywire.com",
    "justthenews.com",
    "newsmax.com",
    "redstate.com",
    "thegatewaypundit.com",
    "townhall.com",
    "zerohedge.com",
    "econotimes.com",
    "oilprice.com",
}
LOW_CREDIBILITY_HOST_MARKERS = (
    "dictionary",
    "forums",
    "wiki",
    "coupon",
)
EVIDENCE_WORDS = {
    "appeal",
    "audit",
    "complaint",
    "court",
    "deposition",
    "document",
    "email",
    "ethics",
    "filing",
    "hearing",
    "injunction",
    "investigation",
    "judge",
    "lawsuit",
    "memo",
    "motion",
    "order",
    "records",
    "report",
    "ruling",
    "subpoena",
    "transcript",
    "vote",
    "watchdog",
}
SOURCE_KIND_WEIGHTS = {
    "reporting": 0.45,
    "institutional": 0.32,
    "other": 0.0,
    "reference": -0.3,
    "forum": -0.55,
    "social": -0.7,
}


def _host(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def _clean_title(value: str | None) -> str:
    return normalize_whitespace((value or "").strip().lower())


def _query_tokens(query: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (query or "").lower())
    return [token for token in tokens if len(token) >= 4 and token not in QUERY_STOPWORDS and not token.isdigit()]


def _normalize_query(query: str) -> str:
    normalized = normalize_whitespace(query or "")
    lowered = normalized.lower()
    current_year_fragment = str(settings.current_news_min_year)
    if any(marker in lowered for marker in FOREIGN_POLICY_QUERY_MARKERS):
        anchored = normalized
        if "trump" not in lowered:
            anchored = f"{anchored} Trump"
        if "white house" not in lowered:
            anchored = f"{anchored} White House"
        if "administration" not in lowered:
            anchored = f"{anchored} administration"
        if "pentagon" not in lowered:
            anchored = f"{anchored} Pentagon"
        if current_year_fragment not in anchored.lower():
            return f"{anchored} {current_year_fragment}".strip()
        return anchored.strip()
    if any(marker in lowered for marker in POLITICAL_QUERY_MARKERS):
        anchored = normalized
        if "trump" not in lowered:
            anchored = f"{anchored} Trump"
        if "administration" not in lowered and "white house" not in lowered:
            anchored = f"{anchored} administration"
        if current_year_fragment not in anchored.lower():
            return f"{anchored} {current_year_fragment}".strip()
        return anchored.strip()
    return f"{normalized} Trump administration {current_year_fragment}".strip()


def _preferred_search_categories(query: str) -> str | None:
    lowered = (query or "").lower()
    if any(marker in lowered for marker in POLITICAL_QUERY_MARKERS) or any(
        marker in lowered for marker in FOREIGN_POLICY_QUERY_MARKERS
    ):
        return "news"
    return None


def _contains_political_signal(text: str) -> bool:
    lowered = (text or "").lower()
    return has_bat_focus(lowered) or any(signal in lowered for signal in POLITICAL_SIGNALS)


def _targets_foreign_policy_heat(query: str) -> bool:
    lowered = (query or "").lower()
    return any(marker in lowered for marker in FOREIGN_POLICY_QUERY_MARKERS)


def _is_blocked_domain(url: str) -> bool:
    host = _host(url)
    for blocked in settings.blocked_domains:
        if host == blocked or host.endswith(f".{blocked}"):
            return True
    return False


def _credibility_tier(host: str) -> tuple[str, float]:
    host_l = (host or "").lower()
    host_kind = source_kind(host_l)
    if host_l.endswith(".gov") or host_l in HIGH_CREDIBILITY_HOSTS:
        return "high", 1.25
    if host_l in LOW_CREDIBILITY_HOSTS or any(host_l.endswith(f".{blocked}") for blocked in LOW_CREDIBILITY_HOSTS):
        return "low", -1.15
    if host_kind == "institutional":
        return "high", 0.9
    if host_kind in {"forum", "social"}:
        return "low", -0.9
    if host_kind == "reference":
        return "low", -0.55
    if any(marker in host_l for marker in LOW_CREDIBILITY_HOST_MARKERS):
        return "low", -0.6
    return "medium", -0.1


def _recency_score(published: Any) -> float:
    if not published:
        return 0.0
    try:
        dt = date_parser.parse(str(published))
    except (TypeError, ValueError, OverflowError):
        return 0.0

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = max(0, int((datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds() // 86400))
    if age_days <= 2:
        return 0.8
    if age_days <= 7:
        return 0.55
    if age_days <= 30:
        return 0.3
    if age_days > 365:
        return -0.4
    return 0.0


def _source_quality_score(query: str, result: dict, page: dict, raw_text: str) -> float:
    haystack = " ".join(
        [
            (result.get("title") or ""),
            (result.get("snippet") or ""),
            (result.get("content") or ""),
            (result.get("url") or ""),
            (result.get("link") or ""),
            (page.get("title") or ""),
            raw_text[:2200],
        ]
    ).lower()

    query_tokens = _query_tokens(query)
    overlap = sum(1 for token in query_tokens if token in haystack)
    political_signal = _contains_political_signal(haystack)
    host = _host(result.get("url") or result.get("link") or page.get("url") or "")
    host_kind = source_kind(host)
    credibility_tier, credibility_boost = _credibility_tier(host)
    evidence_hits = sum(1 for marker in EVIDENCE_WORDS if marker in haystack)
    title = (result.get("title") or page.get("title") or "").strip()

    score = 0.0
    score += min(3.0, overlap * 0.75)
    if political_signal:
        score += 2.5
    score += min(1.0, evidence_hits * 0.18)
    if len(raw_text) >= settings.ingestion_min_text_length:
        score += 0.9
    if len(raw_text) >= 1200:
        score += 0.8
    score += credibility_boost
    score += SOURCE_KIND_WEIGHTS.get(host_kind, 0.0)
    score += _recency_score(result.get("published") or result.get("published_at"))

    if any(marker in haystack for marker in LOW_VALUE_MARKERS):
        score -= 2.4
    if title.endswith("...") or "..." in title:
        score -= 0.3
    if _is_blocked_domain(result.get("url") or result.get("link") or page.get("url") or ""):
        score -= 3.0
    if credibility_tier == "low" and not political_signal:
        score -= 1.2
    if credibility_tier == "medium":
        score = min(score, 7.6)
    elif credibility_tier == "low":
        score = min(score, 5.6)

    return round(score, 2)


def _editorial_priority_score(query: str, result: dict, page: dict, raw_text: str, *, quality: float) -> float:
    haystack = " ".join(
        [
            (result.get("title") or ""),
            (result.get("snippet") or ""),
            (result.get("content") or ""),
            (page.get("title") or ""),
            raw_text[:2200],
        ]
    ).lower()
    host = _host(result.get("url") or result.get("link") or page.get("url") or "")
    host_kind = source_kind(host)
    credibility_tier, _ = _credibility_tier(host)
    query_tokens = _query_tokens(query)
    overlap = sum(1 for token in query_tokens if token in haystack)
    evidence_hits = sum(1 for marker in EVIDENCE_WORDS if marker in haystack)
    search_rank = result.get("rank")
    rank_bonus = 0.0
    if isinstance(search_rank, int) and search_rank > 0:
        rank_bonus = max(0.0, 0.5 - ((search_rank - 1) * 0.05))

    priority = quality
    priority += SOURCE_KIND_WEIGHTS.get(host_kind, 0.0) * 1.8
    priority += min(1.3, overlap * 0.22)
    priority += min(1.1, evidence_hits * 0.18)
    priority += rank_bonus
    if credibility_tier == "high":
        priority += 0.75
    elif credibility_tier == "medium":
        priority -= 0.1
        priority = min(priority, quality + 0.9)
    else:
        priority -= 0.9
        priority = min(priority, quality + 0.35)
    if (result.get("title") or page.get("title") or "").strip().endswith("..."):
        priority -= 0.4
    return round(priority, 2)


def _is_relevant_result(query: str, result: dict, page: dict, raw_text: str) -> tuple[bool, str, float]:
    if len(raw_text) < settings.ingestion_min_text_length:
        return False, "raw_text_too_short", 0.0

    query_tokens = _query_tokens(query)
    haystack = " ".join(
        [
            (result.get("title") or ""),
            (result.get("snippet") or result.get("content") or ""),
            (result.get("url") or result.get("link") or ""),
            (page.get("title") or ""),
            raw_text[:2200],
        ]
    ).lower()

    overlaps = [token for token in query_tokens if token in haystack]
    minimum_overlap = 2 if len(query_tokens) >= 4 else 1
    if query_tokens and len(overlaps) < minimum_overlap:
        return False, "token_overlap_too_low", 0.0

    if _targets_foreign_policy_heat(query) and not any(marker in haystack for marker in FOREIGN_POLICY_QUERY_MARKERS):
        return False, "missing_foreign_policy_markers", 0.0

    if not _contains_political_signal(haystack):
        return False, "missing_political_signals", 0.0

    quality = _source_quality_score(query, result, page, raw_text)
    if quality < float(settings.ingestion_min_quality_score):
        return False, "quality_score_below_threshold", quality

    recency = current_news_assessment(
        query_text=query,
        title=result.get("title") or page.get("title"),
        snippet=result.get("snippet") or result.get("content"),
        raw_text=raw_text,
        published_hint=result.get("published") or result.get("published_at"),
        quality_score=quality,
        credibility_tier=_credibility_tier(_host(result.get("url") or result.get("link") or page.get("url") or ""))[0],
        fallback_dt=datetime.utcnow(),
    )
    if not recency.get("bat_focus"):
        return False, "bat_focus_too_weak", quality
    if not recency.get("current_news_eligible") and not recency.get("fundamental_view_candidate"):
        return False, "outside_current_news_window", quality

    return True, "ok", quality


async def _find_existing_source(
    db: AsyncSession,
    *,
    digest: str,
    canonical_url: str,
    candidate_title: str,
) -> Source | None:
    direct_matches = (
        await db.execute(
            select(Source)
            .where((Source.hash == digest) | (Source.canonical_url == canonical_url))
            .order_by(Source.fetched_at.desc(), Source.id.desc())
            .limit(10)
        )
    ).scalars().all()
    if direct_matches:
        # If historical duplicates exist, keep pipeline moving by choosing the most recent row.
        return direct_matches[0]

    if candidate_title:
        host = _host(canonical_url)
        title_matches = (await db.execute(select(Source).where(Source.title == candidate_title).limit(10))).scalars().all()
        for row in title_matches:
            known_host = _host(row.canonical_url or row.source_url or "")
            if known_host and known_host == host:
                return row
    return None


def _news_source_meta(
    existing_meta: dict[str, Any] | None,
    *,
    normalized_query: str,
    query: str,
    quality: float,
    credibility_tier: str,
    result: dict[str, Any],
    host_kind: str,
    host: str,
    host_label: str,
    editorial_priority: float,
    published_val: Any,
    recency: dict[str, Any],
) -> dict[str, Any]:
    return {
        **(existing_meta or {}),
        "query": normalized_query,
        "query_original": query,
        "source_layer": "normalized_source",
        "quality_score": quality,
        "credibility_tier": credibility_tier,
        "updated_from_search": datetime.utcnow().isoformat(),
        "search_rank": result.get("rank"),
        "search_engine": result.get("engine") or "unknown",
        "search_snippet": result.get("snippet") or result.get("content"),
        "source_kind": host_kind,
        "source_host": host,
        "source_host_label": host_label,
        "editorial_priority_score": editorial_priority,
        "published_hint": published_val,
        "published_year": recency.get("published_year"),
        "source_recency_mode": recency.get("recency_mode"),
        "current_news_eligible": bool(recency.get("current_news_eligible")),
        "fundamental_view_candidate": bool(recency.get("fundamental_view_candidate")),
        "satire_safe": True,
    }


def _apply_news_source_update(
    source: Source,
    *,
    source_url: str,
    canonical_url: str,
    title: str,
    raw_html: str,
    raw_text: str,
    digest: str,
    normalized_query: str,
    query: str,
    quality: float,
    credibility_tier: str,
    result: dict[str, Any],
    host_kind: str,
    host: str,
    host_label: str,
    editorial_priority: float,
    published_val: Any,
    recency: dict[str, Any],
) -> bool:
    content_changed = bool((source.hash or "") != digest or (source.raw_text or "") != raw_text)
    source.source_name = host_label
    source.source_url = source_url
    source.title = title or source.title
    source.fetched_at = datetime.utcnow()
    source.published_at = recency.get("resolved_at") or source.published_at
    source.raw_html = raw_html or source.raw_html
    source.raw_text = raw_text
    source.canonical_url = canonical_url
    source.hash = digest
    source.meta = _news_source_meta(
        source.meta,
        normalized_query=normalized_query,
        query=query,
        quality=quality,
        credibility_tier=credibility_tier,
        result=result,
        host_kind=host_kind,
        host=host,
        host_label=host_label,
        editorial_priority=editorial_priority,
        published_val=published_val,
        recency=recency,
    )
    return content_changed


def _x_source_meta(
    existing_meta: dict[str, Any] | None,
    *,
    normalized_query: str,
    query: str,
    metrics: dict[str, Any],
    post_id: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    published_at = parse_datetime(row.get("created_at"))
    return {
        **(existing_meta or {}),
        "query": normalized_query,
        "query_original": query,
        "source_layer": "normalized_source",
        "quality_score": 3.2,
        "credibility_tier": "social",
        "updated_from_x": datetime.utcnow().isoformat(),
        "x_post_id": post_id,
        "lang": row.get("lang"),
        "created_at": row.get("created_at"),
        "source_kind": "social",
        "source_host": "x.com",
        "source_host_label": "X",
        "editorial_priority_score": 0.2,
        "published_hint": row.get("created_at"),
        "published_year": published_at.year if published_at else None,
        "current_news_eligible": True,
        "public_metrics": metrics,
        "satire_safe": True,
    }


def _apply_x_source_update(
    source: Source,
    *,
    source_url: str,
    canonical_url: str,
    text: str,
    digest: str,
    normalized_query: str,
    query: str,
    metrics: dict[str, Any],
    post_id: str,
    row: dict[str, Any],
) -> bool:
    content_changed = bool((source.hash or "") != digest or (source.raw_text or "") != text)
    source.source_name = "X"
    source.source_url = source_url
    source.title = text[:140] or source.title
    source.author = row.get("author_id")
    source.fetched_at = datetime.utcnow()
    source.published_at = row.get("created_at")
    source.raw_text = text
    source.canonical_url = canonical_url
    source.hash = digest
    source.meta = _x_source_meta(
        source.meta,
        normalized_query=normalized_query,
        query=query,
        metrics=metrics,
        post_id=post_id,
        row=row,
    )
    return content_changed


async def _commit_new_source(
    db: AsyncSession,
    *,
    source: Source,
    digest: str,
    canonical_url: str,
    candidate_title: str,
) -> tuple[Source, bool]:
    db.add(source)
    try:
        await db.commit()
        await db.refresh(source)
        return source, True
    except IntegrityError:
        await db.rollback()
        existing = await _find_existing_source(
            db,
            digest=digest,
            canonical_url=canonical_url,
            candidate_title=candidate_title,
        )
        if existing is None:
            raise
        return existing, False


async def _sync_source_embeddings(
    db: AsyncSession,
    *,
    source: Source,
    chunks: list[dict[str, Any]],
    normalized_query: str,
    origin: str,
    content_changed: bool = False,
) -> dict[str, int | bool | str]:
    metadata = source.meta or {}
    existing_count = int(
        (
            await db.scalar(
                select(func.count()).select_from(SourceEmbedding).where(SourceEmbedding.source_id == source.id)
            )
        )
        or 0
    )
    existing_rows: list[SourceEmbedding] = []
    stored_count = 0
    failed_count = 0
    available_count = existing_count
    requested_count = len(chunks) if chunks else existing_count
    shape_mismatch = bool(existing_count and chunks and existing_count != len(chunks))
    model_mismatch = bool(
        existing_count
        and metadata.get("embedding_model")
        and str(metadata.get("embedding_model")) != settings.embedding_model
    )
    collection_mismatch = bool(
        existing_count
        and metadata.get("embedding_collection")
        and str(metadata.get("embedding_collection")) != COLLECTION
    )
    refresh_requested = bool(
        existing_count
        and (
            content_changed
            or bool(metadata.get("embedding_needs_refresh"))
            or shape_mismatch
            or model_mismatch
            or collection_mismatch
        )
    )
    refresh_applied = False

    if existing_count == 0 and chunks:
        point_ids = await upsert_chunk_vectors(chunks)
        for item, point_id in zip(chunks, point_ids, strict=True):
            if not point_id:
                failed_count += 1
                continue
            db.add(
                SourceEmbedding(
                    source_id=item["source_id"],
                    chunk_index=item["chunk_index"],
                    chunk_text=item["chunk_text"],
                    embedding_ref=point_id,
                    meta={
                        "provider": "qdrant",
                        "origin": origin,
                        "source_layer": "raw_source_chunk",
                        "query": normalized_query,
                    },
                )
            )
            stored_count += 1
        available_count = stored_count
    elif refresh_requested and chunks:
        existing_rows = (
            await db.execute(select(SourceEmbedding).where(SourceEmbedding.source_id == source.id))
        ).scalars().all()
        point_ids, points = await prepare_chunk_points(chunks)
        failed_count = max(0, len(chunks) - len(points))
        if points and await index_prepared_points(points):
            old_refs = [str(row.embedding_ref) for row in existing_rows if row.embedding_ref]
            await db.execute(delete(SourceEmbedding).where(SourceEmbedding.source_id == source.id))
            for item, point_id in zip(chunks, point_ids, strict=True):
                if not point_id:
                    continue
                db.add(
                    SourceEmbedding(
                        source_id=item["source_id"],
                        chunk_index=item["chunk_index"],
                        chunk_text=item["chunk_text"],
                        embedding_ref=point_id,
                        meta={
                            "provider": "qdrant",
                            "origin": origin,
                            "source_layer": "raw_source_chunk",
                            "query": normalized_query,
                        },
                    )
                )
                stored_count += 1
            available_count = stored_count
            refresh_applied = True
            if old_refs and not await delete_points(old_refs):
                log_event(
                    logger,
                    "embedding.refresh.cleanup_failed",
                    level=30,
                    source_id=str(source.id),
                    old_point_count=len(old_refs),
                )
        else:
            failed_count = max(failed_count, len(chunks))

    needs_refresh = bool((refresh_requested and not refresh_applied) or (failed_count and chunks))
    if available_count and failed_count and (stored_count > 0 or existing_count == 0):
        embedding_status = "partial"
    elif available_count and needs_refresh:
        embedding_status = "refresh_due"
    elif available_count:
        embedding_status = "embedded"
    else:
        embedding_status = "missing"

    source.meta = {
        **(source.meta or {}),
        "embedding_status": embedding_status,
        "embedding_chunk_count": requested_count or available_count,
        "embedded_chunk_count": available_count,
        "embedding_provider": "qdrant" if available_count else None,
        "embedding_model": settings.embedding_model if (requested_count or available_count) else None,
        "embedding_collection": COLLECTION if (requested_count or available_count) else None,
        "embedding_query": normalized_query,
        "embedding_origin": origin,
        "embedding_needs_refresh": needs_refresh,
        "embedding_updated_at": datetime.utcnow().isoformat(),
        "vector_indexed": bool(available_count),
    }

    cat_result = await sync_source_memory(
        source,
        query_text=normalized_query,
        allow_sync=bool(available_count and not needs_refresh),
    )

    return {
        "available_count": available_count,
        "stored_count": stored_count,
        "failed_count": failed_count,
        "needs_refresh": needs_refresh,
        "status": embedding_status,
        "cat_status": str(cat_result.get("status") or ""),
    }


async def ingest_query(db: AsyncSession, *, query: str, limit: int = 10) -> dict:
    normalized_query = _normalize_query(query)
    preferred_categories = _preferred_search_categories(normalized_query)
    search_payload = await search_searxng(
        normalized_query,
        limit=limit,
        include_debug=True,
        categories=preferred_categories,
    )
    results = search_payload.get("results", []) if isinstance(search_payload, dict) else []
    search_debug = search_payload.get("debug", {}) if isinstance(search_payload, dict) else {}

    if preferred_categories and not results:
        search_payload = await search_searxng(normalized_query, limit=limit, include_debug=True)
        results = search_payload.get("results", []) if isinstance(search_payload, dict) else []
        search_debug = search_payload.get("debug", {}) if isinstance(search_payload, dict) else {}
        if isinstance(search_debug, dict):
            search_debug["category_fallback"] = preferred_categories

    created = 0
    updated = 0
    skipped_irrelevant = 0
    skipped_blocked_domain = 0
    skipped_domain_backoff = 0
    skipped_fetch_failed = 0
    skipped_embedding = 0
    high_quality_kept = 0
    embedding_ready_sources = 0
    embedded_chunks_created = 0
    embedding_backfilled = 0

    log_event(
        logger,
        "ingest_query.started",
        query=query,
        normalized_query=normalized_query,
        requested_limit=limit,
        discovered=len(results),
        debug=search_debug,
    )

    for result in results:
        url = result.get("url") or result.get("link")
        if not url:
            continue

        if _is_blocked_domain(url):
            skipped_blocked_domain += 1
            continue

        domain_backoff = get_domain_backoff(url)
        if domain_backoff:
            skipped_domain_backoff += 1
            log_event(
                logger,
                "ingest_query.skipped",
                query=normalized_query,
                url=url,
                reason="domain_backoff_active",
                backoff_domain=domain_backoff.get("host"),
                status_code=domain_backoff.get("status_code"),
                retry_after_seconds=domain_backoff.get("remaining_seconds"),
                title=result.get("title"),
            )
            continue

        canonical = canonicalize_url(url)
        page = await fetch_page(url)
        raw_text = page.get("text", "")
        if not page.get("ok") or not raw_text:
            if page.get("error") == "domain_backoff_active":
                skipped_domain_backoff += 1
            else:
                skipped_fetch_failed += 1
            continue

        if page.get("content_type") and "html" not in str(page.get("content_type")).lower():
            skipped_fetch_failed += 1
            continue

        relevant, reason, quality = _is_relevant_result(normalized_query, result, page, raw_text)
        if not relevant:
            skipped_irrelevant += 1
            log_event(
                logger,
                "ingest_query.skipped",
                query=normalized_query,
                url=url,
                reason=reason,
                quality_score=quality,
                title=result.get("title"),
            )
            continue

        if quality >= max(float(settings.ingestion_min_quality_score), 4.0):
            high_quality_kept += 1

        digest = text_hash(raw_text)
        title = (result.get("title") or page.get("title") or "")[:500]
        source = await _find_existing_source(
            db,
            digest=digest,
            canonical_url=canonical,
            candidate_title=title,
        )

        host = _host(url)
        host_kind = source_kind(host)
        host_label = source_label(url, fallback=result.get("engine") or host)
        credibility_tier, _ = _credibility_tier(host)
        published_val = result.get("published") or result.get("published_at")
        recency = current_news_assessment(
            query_text=normalized_query,
            title=title,
            snippet=result.get("snippet") or result.get("content"),
            raw_text=raw_text,
            published_hint=published_val,
            quality_score=quality,
            credibility_tier=credibility_tier,
            fallback_dt=datetime.utcnow(),
        )
        editorial_priority = _editorial_priority_score(
            normalized_query,
            result,
            page,
            raw_text,
            quality=quality,
        )

        chunks = [
            {
                "source_id": source.id if source else None,
                "chunk_index": idx,
                "chunk_text": text,
                "metadata": {
                    "source_layer": "raw_source_chunk",
                    "source_url": canonical,
                    "source_type": "news",
                    "query": normalized_query,
                    "credibility_tier": credibility_tier,
                    "source_kind": host_kind,
                    "source_host_label": host_label,
                },
            }
            for idx, text in enumerate(
                chunk_text(
                    raw_text,
                    size=max(300, int(settings.embedding_chunk_size)),
                    overlap=max(20, int(settings.embedding_chunk_overlap)),
                )[: max(1, int(settings.embedding_max_chunks_per_source))]
            )
        ]

        if source:
            content_changed = _apply_news_source_update(
                source,
                source_url=url,
                canonical_url=canonical,
                title=title,
                raw_html=page.get("html", ""),
                raw_text=raw_text,
                digest=digest,
                normalized_query=normalized_query,
                query=query,
                quality=quality,
                credibility_tier=credibility_tier,
                result=result,
                host_kind=host_kind,
                host=host,
                host_label=host_label,
                editorial_priority=editorial_priority,
                published_val=published_val,
                recency=recency,
            )
            for item in chunks:
                item["source_id"] = source.id
            embedding_result = await _sync_source_embeddings(
                db,
                source=source,
                chunks=chunks,
                normalized_query=normalized_query,
                origin="web",
                content_changed=content_changed,
            )
            if int(embedding_result.get("available_count") or 0):
                embedding_ready_sources += 1
            if int(embedding_result.get("stored_count") or 0):
                embedding_backfilled += 1
                embedded_chunks_created += int(embedding_result.get("stored_count") or 0)
            skipped_embedding += int(embedding_result.get("failed_count") or 0)
            updated += 1
            await db.commit()
            continue

        source = Source(
            source_type="news",
            source_name=host_label,
            source_url=url,
            title=title,
            author=None,
            published_at=recency.get("resolved_at"),
            raw_html=page.get("html", ""),
            raw_text=raw_text,
            canonical_url=canonical,
            hash=digest,
            meta={
                **_news_source_meta(
                    None,
                    normalized_query=normalized_query,
                    query=query,
                    quality=quality,
                    credibility_tier=credibility_tier,
                    result=result,
                    host_kind=host_kind,
                    host=host,
                    host_label=host_label,
                    editorial_priority=editorial_priority,
                    published_val=published_val,
                    recency=recency,
                ),
                "discovered_at": datetime.utcnow().isoformat(),
            },
        )
        source, inserted_new = await _commit_new_source(
            db,
            source=source,
            digest=digest,
            canonical_url=canonical,
            candidate_title=title,
        )
        if not inserted_new:
            log_event(
                logger,
                "ingest_query.duplicate_recovered",
                query=normalized_query,
                canonical_url=canonical,
                title=title,
            )
            content_changed = _apply_news_source_update(
                source,
                source_url=url,
                canonical_url=canonical,
                title=title,
                raw_html=page.get("html", ""),
                raw_text=raw_text,
                digest=digest,
                normalized_query=normalized_query,
                query=query,
                quality=quality,
                credibility_tier=credibility_tier,
                result=result,
                host_kind=host_kind,
                host=host,
                host_label=host_label,
                editorial_priority=editorial_priority,
                published_val=published_val,
                recency=recency,
            )
        else:
            content_changed = False
        for item in chunks:
            item["source_id"] = source.id
            item["metadata"]["source_url"] = source.source_url
            item["metadata"]["source_type"] = source.source_type

        embedding_result = await _sync_source_embeddings(
            db,
            source=source,
            chunks=chunks,
            normalized_query=normalized_query,
            origin="web",
            content_changed=content_changed,
        )
        if int(embedding_result.get("available_count") or 0):
            embedding_ready_sources += 1
        embedded_chunks_created += int(embedding_result.get("stored_count") or 0)
        skipped_embedding += int(embedding_result.get("failed_count") or 0)

        await db.commit()
        if inserted_new:
            created += 1
        else:
            updated += 1

    total_sources = await db.scalar(select(func.count()).select_from(Source))
    summary = {
        "query": query,
        "normalized_query": normalized_query,
        "result_count": len(results),
        "created": created,
        "updated": updated,
        "high_quality_kept": high_quality_kept,
        "skipped_irrelevant": skipped_irrelevant,
        "skipped_blocked_domain": skipped_blocked_domain,
        "skipped_domain_backoff": skipped_domain_backoff,
        "skipped_fetch_failed": skipped_fetch_failed,
        "skipped_embedding": skipped_embedding,
        "embedding_ready_sources": embedding_ready_sources,
        "embedded_chunks_created": embedded_chunks_created,
        "embedding_backfilled": embedding_backfilled,
        "total_sources": int(total_sources or 0),
        "search_debug": search_debug,
    }

    await record_revision(
        db,
        object_table="ingestion_run",
        object_id=uuid.uuid4(),
        action="completed",
        actor="researcher",
        snapshot=summary,
    )

    log_event(logger, "ingest_query.completed", **summary)
    return summary


async def ingest_x_query(db: AsyncSession, *, query: str, limit: int = 8) -> dict:
    normalized_query = _normalize_query(query)
    results = await search_x_recent(normalized_query, limit=limit)
    created = 0
    updated = 0
    skipped_embedding = 0
    embedding_ready_sources = 0
    embedded_chunks_created = 0

    for row in results:
        post_id = str(row.get("id") or "").strip()
        text = normalize_whitespace((row.get("text") or "").strip())
        if not post_id or not text:
            continue

        source_url = f"https://x.com/i/web/status/{post_id}"
        canonical = canonicalize_url(source_url)
        digest = text_hash(f"x:{post_id}:{text}")

        source = await _find_existing_source(
            db,
            digest=digest,
            canonical_url=canonical,
            candidate_title=text[:140],
        )

        metrics = row.get("public_metrics") if isinstance(row.get("public_metrics"), dict) else {}
        chunks = [
            {
                "source_id": source.id if source else None,
                "chunk_index": 0,
                "chunk_text": text[:1800],
                "metadata": {
                    "source_layer": "raw_source_chunk",
                    "source_type": "x_post",
                    "query": normalized_query,
                    "source_kind": "social",
                    "source_host_label": "X",
                },
            }
        ]
        if source:
            content_changed = _apply_x_source_update(
                source,
                source_url=source_url,
                canonical_url=canonical,
                text=text,
                digest=digest,
                normalized_query=normalized_query,
                query=query,
                metrics=metrics,
                post_id=post_id,
                row=row,
            )
            for item in chunks:
                item["source_id"] = source.id
            embedding_result = await _sync_source_embeddings(
                db,
                source=source,
                chunks=chunks,
                normalized_query=normalized_query,
                origin="x",
                content_changed=content_changed,
            )
            if int(embedding_result.get("available_count") or 0):
                embedding_ready_sources += 1
            embedded_chunks_created += int(embedding_result.get("stored_count") or 0)
            skipped_embedding += int(embedding_result.get("failed_count") or 0)
            updated += 1
            await db.commit()
            continue

        source = Source(
            source_type="x_post",
            source_name="X",
            source_url=source_url,
            title=text[:140],
            author=row.get("author_id"),
            published_at=row.get("created_at"),
            raw_html=None,
            raw_text=text,
            canonical_url=canonical,
            hash=digest,
            meta=_x_source_meta(
                None,
                normalized_query=normalized_query,
                query=query,
                metrics=metrics,
                post_id=post_id,
                row=row,
            ),
        )
        source, inserted_new = await _commit_new_source(
            db,
            source=source,
            digest=digest,
            canonical_url=canonical,
            candidate_title=text[:140],
        )
        if not inserted_new:
            log_event(
                logger,
                "ingest_x_query.duplicate_recovered",
                query=normalized_query,
                canonical_url=canonical,
                post_id=post_id,
            )
            content_changed = _apply_x_source_update(
                source,
                source_url=source_url,
                canonical_url=canonical,
                text=text,
                digest=digest,
                normalized_query=normalized_query,
                query=query,
                metrics=metrics,
                post_id=post_id,
                row=row,
            )
        else:
            content_changed = False
        for item in chunks:
            item["source_id"] = source.id

        embedding_result = await _sync_source_embeddings(
            db,
            source=source,
            chunks=chunks,
            normalized_query=normalized_query,
            origin="x",
            content_changed=content_changed,
        )
        if int(embedding_result.get("available_count") or 0):
            embedding_ready_sources += 1
        embedded_chunks_created += int(embedding_result.get("stored_count") or 0)
        skipped_embedding += int(embedding_result.get("failed_count") or 0)

        await db.commit()
        if inserted_new:
            created += 1
        else:
            updated += 1

    total_sources = await db.scalar(select(func.count()).select_from(Source))
    summary = {
        "query": query,
        "normalized_query": normalized_query,
        "result_count": len(results),
        "created": created,
        "updated": updated,
        "skipped_embedding": skipped_embedding,
        "embedding_ready_sources": embedding_ready_sources,
        "embedded_chunks_created": embedded_chunks_created,
        "mode": "x_recent_search",
        "enabled": bool(settings.x_enabled),
        "total_sources": int(total_sources or 0),
    }
    await record_revision(
        db,
        object_table="ingestion_run",
        object_id=uuid.uuid4(),
        action="x_completed",
        actor="researcher",
        snapshot=summary,
    )
    log_event(logger, "ingest_x_query.completed", **summary)
    return summary
