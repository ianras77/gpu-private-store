from __future__ import annotations

from datetime import datetime, timezone
import re
import uuid
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Source, Theme, ThemeMember, TrendObservation
from services.cat_memory_service import recall_source_ids
from services.embedding_service import embed_text
from services.source_policy import has_bat_focus, source_current_news_assessment
from services.structured_logging import get_logger, log_event
from services.qdrant_service import search_points

logger = get_logger("bat.retrieval")

RETRIEVAL_KIND_WEIGHTS = {
    "reporting": 1.1,
    "institutional": 0.9,
    "other": -0.15,
    "reference": -1.25,
    "forum": -1.6,
    "social": -1.8,
}
RETRIEVAL_ALLOWED_SOURCE_KINDS = {"reporting", "institutional"}
LOW_SIGNAL_TITLE_MARKERS = (
    "top stories",
    "cartoons",
    "commentary",
    "live updates",
    "live update",
    "live blog",
    "live coverage",
    "watch live",
    "breaking live",
    "minute-by-minute",
    "price chart",
    "price today",
    "prices today",
    "oil price",
    "periodic reviews",
    "primary results",
    "definition, history",
    "definition",
    "history, & beliefs",
)
QUERY_STOPWORDS = {
    "about",
    "after",
    "amid",
    "analysis",
    "around",
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
EVIDENCE_MARKERS = (
    "appeal",
    "backlash",
    "briefing",
    "ceasefire",
    "congress",
    "court",
    "filing",
    "injunction",
    "judge",
    "lawsuit",
    "memo",
    "missile",
    "order",
    "press secretary",
    "retaliation",
    "ruling",
    "sanctions",
    "statement",
    "strike",
    "troops",
    "war powers",
)


def _host(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def _title_looks_low_signal(title: str | None) -> bool:
    lowered = (title or "").strip().lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in LOW_SIGNAL_TITLE_MARKERS)


def _safe_uuid(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _source_age_days(source: Source) -> int:
    age_days = source_current_news_assessment(source).get("age_days")
    return int(age_days) if age_days is not None else 10_000


def _credibility_priority(value: str | None) -> float:
    normalized = _clean_text(value).lower()
    if normalized == "high":
        return 2.0
    if normalized == "medium":
        return 1.0
    return 0.0


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _contains_focus_term(text: str | None, term: str) -> bool:
    haystack = _clean_text(text).lower()
    needle = _clean_text(term).lower()
    if not haystack or not needle:
        return False
    if " " in needle:
        pattern = re.escape(needle).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack))
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack))


def _query_focus_terms(query_text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9']+", (query_text or "").lower())
        if len(token) >= 4 and token not in QUERY_STOPWORDS and not token.isdigit()
    ]


def _bundle_focus_terms(query_text: str, *, focus_theme: Theme | None = None) -> set[str]:
    theme_parts = []
    if focus_theme:
        theme_parts.extend(
            [
                str(focus_theme.name or ""),
                str(focus_theme.slug or "").replace("-", " "),
            ]
        )
        description = _clean_text(str(focus_theme.description or ""))
        if description and not description.lower().startswith("recurring pattern bucket:"):
            theme_parts.append(description)
    return set(_query_focus_terms(" ".join([query_text, *theme_parts]).strip()))


def _focus_term_hits(text: str | None, *, focus_terms: set[str]) -> int:
    if not _clean_text(text) or not focus_terms:
        return 0
    return sum(1 for term in focus_terms if _contains_focus_term(text, term))


def _source_query_alignment_score(source: Source, *, focus_terms: set[str]) -> float:
    if not focus_terms:
        return 0.0
    metadata = source.meta or {}
    title_hits = _focus_term_hits(source.title, focus_terms=focus_terms)
    snippet_hits = _focus_term_hits(str(metadata.get("search_snippet") or ""), focus_terms=focus_terms)
    raw_hits = min(3, _focus_term_hits((source.raw_text or "")[:2400], focus_terms=focus_terms))
    return round((title_hits * 1.6) + (snippet_hits * 0.8) + (raw_hits * 0.45), 2)


def _sentence_candidates(text: str) -> list[str]:
    normalized = _clean_text(text)
    if not normalized:
        return []
    candidates: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", normalized):
        cleaned = sentence.strip().strip("\"'` ")
        if len(cleaned) < 48:
            continue
        if len(cleaned) > 320:
            continue
        candidates.append(cleaned)
    return candidates


def _evidence_excerpt_score(sentence: str, *, query_terms: list[str]) -> tuple[int, int, int, int]:
    lowered = sentence.lower()
    query_hits = sum(1 for term in query_terms if term in lowered)
    evidence_hits = sum(1 for marker in EVIDENCE_MARKERS if marker in lowered)
    number_bonus = 1 if re.search(r"\b\d+\b", sentence) else 0
    length_bonus = max(0, 220 - abs(len(sentence) - 180))
    return (query_hits, evidence_hits, number_bonus, length_bonus)


def _excerpt_query_hit_floor(query_terms: list[str]) -> int:
    if len(query_terms) >= 4:
        return 2
    if len(query_terms) >= 2:
        return 1
    return 0


def _extract_evidence_excerpts(source: Source, *, query_text: str, limit: int = 2) -> list[str]:
    metadata = source.meta or {}
    query_terms = _query_focus_terms(query_text)
    query_hit_floor = _excerpt_query_hit_floor(query_terms)
    candidates = _sentence_candidates(source.raw_text or "")
    fallback_lines = [
        _clean_text(str(metadata.get("search_snippet") or "")),
        _clean_text(source.title or ""),
    ]

    seen: set[str] = set()
    excerpts: list[str] = []
    ranked = sorted(
        candidates,
        key=lambda sentence: _evidence_excerpt_score(sentence, query_terms=query_terms),
        reverse=True,
    )
    for sentence in ranked:
        fingerprint = re.sub(r"[^a-z0-9]+", " ", sentence.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        lowered = sentence.lower()
        query_hits = sum(1 for term in query_terms if term in lowered)
        evidence_hits = any(marker in lowered for marker in EVIDENCE_MARKERS)
        if query_terms and query_hits < query_hit_floor and not evidence_hits:
            continue
        seen.add(fingerprint)
        excerpts.append(sentence[:240])
        if len(excerpts) >= limit:
            return excerpts

    for line in fallback_lines:
        if len(line) < 32:
            continue
        fingerprint = re.sub(r"[^a-z0-9]+", " ", line.lower()).strip()
        if not fingerprint or fingerprint in seen:
            continue
        lowered = line.lower()
        query_hits = sum(1 for term in query_terms if term in lowered)
        evidence_hits = any(marker in lowered for marker in EVIDENCE_MARKERS)
        if query_terms and query_hits < query_hit_floor and not evidence_hits:
            continue
        seen.add(fingerprint)
        excerpts.append(line[:240])
        if len(excerpts) >= limit:
            break
    return excerpts[:limit]


def _has_political_context(source: Source) -> bool:
    metadata = source.meta or {}
    return has_bat_focus(
        source.title,
        str(metadata.get("search_snippet") or ""),
        str(metadata.get("query_original") or ""),
        str(metadata.get("query") or ""),
        (source.raw_text or "")[:1200],
    )


def _source_is_retrieval_eligible(source: Source) -> bool:
    quality = float((source.meta or {}).get("quality_score") or 0)
    if quality < float(settings.retrieval_min_quality_score):
        return False
    assessment = source_current_news_assessment(source)
    if str(assessment.get("source_kind") or "other") not in RETRIEVAL_ALLOWED_SOURCE_KINDS:
        return False
    if not assessment.get("current_news_eligible"):
        return False
    if _source_age_days(source) > int(settings.retrieval_max_source_age_days):
        return False
    if not _has_political_context(source):
        return False
    host = _host(source.canonical_url or source.source_url or "")
    if any(host == blocked or host.endswith(f".{blocked}") for blocked in settings.blocked_domains):
        return False
    return True


def _source_retrieval_score(
    source: Source,
    *,
    focus_terms: set[str] | None = None,
    theme_bonus: float = 0.0,
) -> float:
    metadata = source.meta or {}
    assessment = source_current_news_assessment(source)
    quality = float(metadata.get("quality_score") or 0)
    editorial_priority = float(metadata.get("editorial_priority_score") or 0)
    credibility = str(metadata.get("credibility_tier") or "").lower()
    kind = str(assessment.get("source_kind") or "other")
    age_days = _source_age_days(source)

    score = 0.0
    score += quality * 1.25
    score += editorial_priority * 0.7
    score += RETRIEVAL_KIND_WEIGHTS.get(kind, 0.0)
    if credibility == "high":
        score += 2.2
    elif credibility == "medium":
        score += 0.05
    elif credibility == "low":
        score -= 1.1

    if age_days <= 1:
        score += 1.2
    elif age_days <= 3:
        score += 0.8
    elif age_days <= 7:
        score += 0.4
    elif age_days <= 14:
        score += 0.1

    if _has_political_context(source):
        score += 0.45
    if (source.title or "").strip().endswith("..."):
        score -= 0.3
    if _title_looks_low_signal(source.title):
        score -= 0.9
    focus_terms = focus_terms or set()
    alignment = _source_query_alignment_score(source, focus_terms=focus_terms)
    score += min(alignment, 5.4)
    if focus_terms:
        if alignment <= 0 and kind != "institutional":
            score -= 3.4
        elif alignment < 1.2:
            score -= 1.4
    if theme_bonus > 0:
        score += min(4.0, float(theme_bonus) * 1.2)
    return round(score, 2)


def _published_sort_key(source: Source) -> datetime:
    value = source.published_at or source.fetched_at
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _select_diverse_sources(
    rows: list[Source],
    *,
    limit: int,
    focus_terms: set[str] | None = None,
    theme_bonus_by_source_id: dict[str, float] | None = None,
) -> list[Source]:
    focus_terms = focus_terms or set()
    theme_bonus_by_source_id = theme_bonus_by_source_id or {}
    ranked = sorted(
        rows,
        key=lambda row: (
            _source_retrieval_score(
                row,
                focus_terms=focus_terms,
                theme_bonus=float(theme_bonus_by_source_id.get(str(row.id), 0.0) or 0.0),
            ),
            _published_sort_key(row),
        ),
        reverse=True,
    )
    selected: list[Source] = []
    selected_ids: set[str] = set()
    seen_hosts: set[str] = set()

    anchor_target = min(limit, max(2, limit // 2))
    for row in ranked:
        credibility = str((row.meta or {}).get("credibility_tier") or "").lower()
        kind = str(source_current_news_assessment(row).get("source_kind") or "other").lower()
        if _credibility_priority(credibility) < 2.0 and kind != "institutional":
            continue
        row_id = str(row.id)
        host = _host(row.canonical_url or row.source_url or "")
        if row_id in selected_ids:
            continue
        if host and host in seen_hosts:
            continue
        selected.append(row)
        selected_ids.add(row_id)
        if host:
            seen_hosts.add(host)
        if len(selected) >= anchor_target:
            break

    for row in ranked:
        row_id = str(row.id)
        host = _host(row.canonical_url or row.source_url or "")
        if row_id in selected_ids:
            continue
        if host and host in seen_hosts:
            continue
        selected.append(row)
        selected_ids.add(row_id)
        if host:
            seen_hosts.add(host)
        if len(selected) >= limit:
            return selected[:limit]

    for row in ranked:
        row_id = str(row.id)
        if row_id in selected_ids:
            continue
        selected.append(row)
        selected_ids.add(row_id)
        if len(selected) >= limit:
            break
    return selected[:limit]


async def _search_similar_source_ids(query_text: str, limit: int) -> list[uuid.UUID]:
    vector = await embed_text(query_text)
    if not vector:
        return []

    try:
        rows = await search_points(vector, max(1, limit), with_payload=True)
        source_ids: list[uuid.UUID] = []
        seen: set[str] = set()
        for row in rows:
            payload = row.get("payload", {}) if isinstance(row, dict) else {}
            source_id = _safe_uuid(payload.get("source_id"))
            if not source_id:
                continue
            if str(source_id) in seen:
                continue
            seen.add(str(source_id))
            source_ids.append(source_id)
        log_event(logger, "retrieval.vector_search.success", query=query_text, returned=len(source_ids))
        return source_ids
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "retrieval.vector_search.failed", level=40, query=query_text, error=str(exc))
        return []


async def build_retrieval_bundle(
    db: AsyncSession,
    *,
    query_text: str,
    theme_slug: str | None = None,
    source_limit: int | None = None,
) -> dict[str, Any]:
    max_sources = source_limit or int(settings.retrieval_max_sources)
    max_themes = int(settings.retrieval_max_themes)
    max_trends = int(settings.retrieval_max_trends)

    vector_source_ids = await _search_similar_source_ids(query_text, limit=max_sources * 2)

    candidate_sources: list[Source] = []
    diagnostics = {
        "vector_candidates": len(vector_source_ids),
        "vector_rejected": 0,
        "cat_candidates": 0,
        "cat_rejected": 0,
        "recent_candidates": 0,
        "recent_rejected": 0,
        "theme_candidates": 0,
        "theme_rejected": 0,
    }
    theme_bonus_by_source_id: dict[str, float] = {}
    if vector_source_ids:
        rows = (await db.execute(select(Source).where(Source.id.in_(vector_source_ids)))).scalars().all()
        by_id = {str(row.id): row for row in rows}
        for source_id in vector_source_ids:
            row = by_id.get(str(source_id))
            if not row:
                continue
            if not _source_is_retrieval_eligible(row):
                diagnostics["vector_rejected"] += 1
                continue
            candidate_sources.append(row)

    cat_source_ids = await recall_source_ids(query_text, limit=max_sources * 2)
    diagnostics["cat_candidates"] = len(cat_source_ids)
    if cat_source_ids:
        rows = (await db.execute(select(Source).where(Source.id.in_(cat_source_ids)))).scalars().all()
        by_id = {str(row.id): row for row in rows}
        for source_id in cat_source_ids:
            row = by_id.get(str(source_id))
            if not row:
                continue
            if not _source_is_retrieval_eligible(row):
                diagnostics["cat_rejected"] += 1
                continue
            candidate_sources.append(row)

    if len(candidate_sources) < max_sources:
        recent_rows = (
            await db.execute(
                select(Source).order_by(Source.fetched_at.desc()).limit(max_sources * 8)
            )
        ).scalars().all()
        diagnostics["recent_candidates"] = len(recent_rows)
        for row in recent_rows:
            if not _source_is_retrieval_eligible(row):
                diagnostics["recent_rejected"] += 1
                continue
            candidate_sources.append(row)

    focus_theme: Theme | None = None
    if theme_slug:
        focus_theme = (await db.execute(select(Theme).where(Theme.slug == theme_slug))).scalar_one_or_none()
        if focus_theme:
            theme_sources = (
                await db.execute(
                    select(Source, ThemeMember.score)
                    .join(ThemeMember, ThemeMember.source_id == Source.id)
                    .where(ThemeMember.theme_id == focus_theme.id)
                    .order_by(desc(ThemeMember.score))
                    .limit(6)
                )
            ).all()
            diagnostics["theme_candidates"] = len(theme_sources)
            for row, membership_score in theme_sources:
                row_id = str(row.id)
                theme_bonus_by_source_id[row_id] = max(
                    float(theme_bonus_by_source_id.get(row_id, 0.0) or 0.0),
                    float(membership_score or 0.0),
                )
                if not _source_is_retrieval_eligible(row):
                    diagnostics["theme_rejected"] += 1
                    continue
                candidate_sources.append(row)

    deduped_candidates: list[Source] = []
    seen_candidate_ids: set[str] = set()
    for row in candidate_sources:
        row_id = str(row.id)
        if row_id in seen_candidate_ids:
            continue
        seen_candidate_ids.add(row_id)
        deduped_candidates.append(row)

    focus_terms = _bundle_focus_terms(query_text, focus_theme=focus_theme)
    ranked_sources = _select_diverse_sources(
        deduped_candidates,
        limit=max_sources,
        focus_terms=focus_terms,
        theme_bonus_by_source_id=theme_bonus_by_source_id,
    )

    themes = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(max_themes))).scalars().all()
    trend_stmt = select(TrendObservation, Theme).outerjoin(Theme, TrendObservation.theme_id == Theme.id)
    if focus_theme:
        trend_stmt = trend_stmt.where(TrendObservation.theme_id == focus_theme.id)
    trend_rows = (
        await db.execute(
            trend_stmt.order_by(TrendObservation.observation_date.desc()).limit(max_trends)
        )
    ).all()
    if focus_theme and not trend_rows:
        trend_rows = (
            await db.execute(
                select(TrendObservation, Theme)
                .outerjoin(Theme, TrendObservation.theme_id == Theme.id)
                .order_by(TrendObservation.observation_date.desc())
                .limit(max_trends)
            )
        ).all()

    bundle = {
        "query_text": query_text,
        "focus_theme": {
            "slug": focus_theme.slug,
            "name": focus_theme.name,
            "active_score": float(focus_theme.active_score or 0),
        }
        if focus_theme
        else None,
        "raw_sources": [
            {
                "id": str(source.id),
                "title": source.title,
                "url": source.source_url,
                "source_type": source.source_type,
                "source_name": source.source_name,
                "source_label": source_current_news_assessment(source).get("source_label"),
                "fetched_at": source.fetched_at.isoformat() if source.fetched_at else None,
                "published_at": source.published_at.isoformat() if source.published_at else None,
                "quality_score": float((source.meta or {}).get("quality_score") or 0),
                "editorial_priority_score": float((source.meta or {}).get("editorial_priority_score") or 0),
                "snippet": (source.meta or {}).get("search_snippet"),
                "credibility_tier": (source.meta or {}).get("credibility_tier"),
                "source_kind": source_current_news_assessment(source).get("source_kind"),
                "source_host": source_current_news_assessment(source).get("source_host"),
                "age_days": _source_age_days(source),
                "published_year": source_current_news_assessment(source).get("published_year"),
                "current_news_eligible": bool(source_current_news_assessment(source).get("current_news_eligible")),
                "fundamental_view_candidate": bool(source_current_news_assessment(source).get("fundamental_view_candidate")),
                "retrieval_score": _source_retrieval_score(
                    source,
                    focus_terms=focus_terms,
                    theme_bonus=float(theme_bonus_by_source_id.get(str(source.id), 0.0) or 0.0),
                ),
                "query_alignment_score": _source_query_alignment_score(source, focus_terms=focus_terms),
                "embedding_status": (source.meta or {}).get("embedding_status"),
                "embedded_chunk_count": int((source.meta or {}).get("embedded_chunk_count") or 0),
                "evidence_excerpts": _extract_evidence_excerpts(source, query_text=query_text, limit=2),
            }
            for source in ranked_sources[:max_sources]
        ],
        "theme_memory": [
            {
                "slug": theme.slug,
                "name": theme.name,
                "active_score": float(theme.active_score or 0),
                "description": theme.description,
            }
            for theme in themes
        ],
        "trend_ledger": [
            {
                "observation_date": trend.observation_date.isoformat(),
                "title": trend.title,
                "summary": trend.summary,
                "change_type": trend.change_type,
                "confidence": float(trend.confidence or 0),
                "theme_slug": linked_theme.slug if linked_theme else None,
                "theme_name": linked_theme.name if linked_theme else None,
            }
            for trend, linked_theme in trend_rows
        ],
        "retrieval_diagnostics": diagnostics,
    }
    log_event(
        logger,
        "retrieval.bundle_ready",
        query=query_text,
        sources=len(bundle["raw_sources"]),
        themes=len(bundle["theme_memory"]),
        trends=len(bundle["trend_ledger"]),
        diagnostics=diagnostics,
    )
    return bundle


def format_retrieval_bundle(bundle: dict[str, Any]) -> str:
    lines: list[str] = []

    if bundle.get("focus_theme"):
        focus = bundle["focus_theme"]
        lines.append("Focus Theme")
        lines.append(
            f"- {focus.get('name')} ({focus.get('slug')}) | active_score={focus.get('active_score')}"
        )
        lines.append("")

    lines.append("Priority Evidence Deck")
    raw_sources = bundle.get("raw_sources", [])
    if not raw_sources:
        lines.append("- No source context available.")
    for source in raw_sources[:4]:
        title = str(source.get("title") or "Untitled").strip() or "Untitled"
        if _title_looks_low_signal(title):
            snippet = str(source.get("snippet") or "").strip()
            source_label = str(source.get("source_label") or source.get("source_name") or "news desk").strip()
            if snippet:
                title = f"{source_label} snippet: {snippet[:180]}"
            else:
                title = f"{source_label} source"
        lines.append(
            "- "
            f"[{source.get('source_type')}/{source.get('source_kind')}] {title} | "
            f"{source.get('source_label') or source.get('source_name') or 'news desk'} | "
            f"quality={source.get('quality_score')}"
            f" | priority={source.get('editorial_priority_score')}"
            f" | age_days={source.get('age_days')}"
            f" | credibility={source.get('credibility_tier') or 'unknown'}"
        )
        for excerpt in (source.get("evidence_excerpts") or [])[:2]:
            cleaned = _clean_text(str(excerpt))
            if cleaned:
                lines.append(f"  evidence: {cleaned[:220]}")
        snippet = _clean_text(str(source.get("snippet") or ""))
        if snippet and not source.get("evidence_excerpts"):
            lines.append(f"  snippet: {snippet[:220]}")

    if len(raw_sources) > 4:
        lines.append(f"- {len(raw_sources) - 4} more source(s) kept in reserve.")

    lines.append("")
    lines.append("Theme Memory")
    theme_memory = bundle.get("theme_memory", [])
    if not theme_memory:
        lines.append("- No active themes.")
    for theme in theme_memory[:2]:
        lines.append(
            "- "
            f"{theme.get('name')} ({theme.get('slug')}), score={theme.get('active_score')} | "
            f"{(theme.get('description') or '')[:180]}"
        )

    lines.append("")
    lines.append("Trend Ledger")
    trend_ledger = bundle.get("trend_ledger", [])
    if not trend_ledger:
        lines.append("- No trend observations.")
    for trend in trend_ledger[:2]:
        lines.append(
            "- "
            f"{trend.get('observation_date')}: {trend.get('title')} "
            f"[{trend.get('change_type')}, confidence={trend.get('confidence')}]"
        )

    return "\n".join(lines).strip()
