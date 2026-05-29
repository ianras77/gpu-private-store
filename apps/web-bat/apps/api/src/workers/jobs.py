import asyncio
from collections.abc import Awaitable, Callable
import json
import re
import uuid
from datetime import datetime
from typing import Any

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import run_with_new_session
from models import AnalysisBrief, EditorialObject, HomepageSnapshot, Source, Theme
from services.analysis_engine import refresh_analysis_briefs, select_analysis_brief
from services.editorial_service import (
    _curate_source_links,
    generate_editorial_object,
    generate_homepage_snapshot,
    generate_social_posts,
    get_runtime_controls,
    rework_editorial_backlog,
    update_voice_memory,
)
from services.ingestion_service import ingest_query, ingest_x_query
from services.pipeline_blueprint import CAT_ROLE_PIPELINE
from services.publishing_service import publish_ready_backlog
from services.revision_service import record_revision
from services.social_dispatcher import dispatch_social_post
from services.source_policy import has_bat_focus, source_current_news_assessment
from services.structured_logging import get_logger, log_event
from services.trend_engine import rebuild_themes

logger = get_logger("bat.pipeline")
PIPELINE_LOCK_KEY = "bat:pipeline:cycle-lock"
ROLE_BY_NAME = {role["role"]: role for role in CAT_ROLE_PIPELINE}
OUTLET_SUFFIX_RE = re.compile(
    r"\s*(?:\||-|:)\s*(AP News|Associated Press|Reuters|The New York Times|The Washington Post|POLITICO|"
    r"NBC News|ABC News|CBS News|CNN|NPR|BBC|Bloomberg|TIME|USA Today|The Guardian)\s*$",
    flags=re.IGNORECASE,
)
EMERGENT_HEAT_MARKERS = (
    "iran",
    "war",
    "strike",
    "missile",
    "retaliation",
    "ceasefire",
    "oil",
    "gas prices",
    "hormuz",
    "middle east",
    "pentagon",
    "sanctions",
)
EMERGENT_REJECT_MARKERS = (
    "britannica",
    "wikipedia",
    "definition",
    "history",
    "beliefs",
    "price chart",
    "price today",
    "quotes",
    "members",
    "top stories",
    "cartoons",
)
INSTRUCTIONAL_QUERY_PREFIX_RE = re.compile(
    r"^(?:write|name|show|find|follow|track|keep|turn|look|pull|give|tell|make|lead|prefer|surface|translate|use|open|sound|let)\b",
    flags=re.IGNORECASE,
)
INSTRUCTIONAL_QUERY_PHRASES = (
    "institutional stress point",
    "lead with",
    "keep it",
    "make it",
    "with receipts",
    "find gold",
    "story form",
    "thread worth",
    "prefer sources with documents",
    "documents, filings, transcripts",
    "direct quotes",
    "who benefits",
    "absorbs the risk",
    "what makes this story distinct",
    "yesterday's outrage cycle",
)
RESEARCH_THEME_QUERY_HINTS = {
    "executive-overreach": "court injunction executive order congress",
    "legal-collision": "judge court filing injunction appeal",
    "culture-war-cosmetics": "school media funding culture war backlash",
    "foreign-policy-escalation": "iran ceasefire sanctions diplomacy war powers",
    "military-brinkmanship": "troops missile strike war powers pentagon",
    "allied-anxiety": "allies diplomacy nato gulf partners",
    "energy-shock-politics": "oil prices hormuz shipping inflation insurance",
    "family-dynastic-branding": "family brand licensing ethics business",
    "institutional-humiliation": "admits error setback retraction court humiliation",
}


def _role_plugins(role_name: str) -> list[str]:
    return list((ROLE_BY_NAME.get(role_name) or {}).get("plugins", []))


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _supports_isolated_sessions(db: AsyncSession) -> bool:
    return isinstance(db, AsyncSession)


async def _run_db_task(
    db: AsyncSession,
    worker: Callable[[AsyncSession], Awaitable[Any]],
    *,
    isolated: bool = True,
) -> Any:
    if isolated and _supports_isolated_sessions(db):
        return await run_with_new_session(worker)
    return await worker(db)


async def _gather_limited(
    items: list[Any],
    worker: Callable[[Any], Awaitable[Any]],
    *,
    limit: int,
    return_exceptions: bool = False,
) -> list[Any]:
    if not items:
        return []
    semaphore = asyncio.Semaphore(max(1, int(limit)))

    async def _run(item: Any) -> Any:
        async with semaphore:
            return await worker(item)

    return await asyncio.gather(*[_run(item) for item in items], return_exceptions=return_exceptions)


def _split_directive_queries(raw: str) -> list[str]:
    if not raw.strip():
        return []
    parts = [part.strip() for part in re.split(r"[\n|]+", raw) if part.strip()]
    return parts


def _directive_queries(controls: dict, *keys: str) -> list[str]:
    for key in keys:
        queries = _split_directive_queries(str(controls.get(key) or ""))
        if queries:
            return queries
    return []


def _search_safe_query(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if not cleaned:
        return ""
    lowered = cleaned.lower()
    if any(phrase in lowered for phrase in INSTRUCTIONAL_QUERY_PHRASES):
        return ""
    if INSTRUCTIONAL_QUERY_PREFIX_RE.match(cleaned):
        return ""
    return cleaned[:220]


def _search_safe_directive_queries(controls: dict, *keys: str) -> list[str]:
    return [query for query in (_search_safe_query(item) for item in _directive_queries(controls, *keys)) if query]


def _dedupe_keep_order(values: list[str], limit: int = 18) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in values:
        normalized = item.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item.strip())
        if len(deduped) >= limit:
            break
    return deduped

def _branch_clean_text(value: object, *, limit: int = 220) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").strip())
    return cleaned[:limit].rstrip()


def _branch_theme_match(slug: str, theme_name: str, item: dict[str, object]) -> bool:
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    haystack = " ".join(
        _branch_clean_text(value).lower()
        for value in [
            item.get("scope_key"),
            item.get("theme_slug"),
            item.get("label"),
            item.get("title"),
            meta.get("theme_slug"),
            meta.get("focus_label"),
        ]
    )
    slug_text = slug.replace("-", " ").lower()
    name_text = theme_name.lower()
    return bool(slug and (slug.lower() in haystack or slug_text in haystack)) or bool(theme_name and name_text in haystack)


def _branch_seed_query(*, theme_name: str, slug: str, query_plan: list[str], opportunity: dict[str, object] | None) -> str:
    hinted = _search_safe_query(str((opportunity or {}).get("query_hint") or ""))
    if hinted:
        return hinted
    theme_terms = [term for term in re.findall(r"[a-z0-9]+", f"{theme_name} {slug}".lower()) if len(term) >= 4]
    for query in query_plan:
        lowered = query.lower()
        if any(term in lowered for term in theme_terms):
            return query
    return query_plan[0] if query_plan else f"Trump {theme_name or slug.replace('-', ' ')} latest {settings.current_news_min_year}"


def _branch_previous_connection(
    *,
    theme_name: str,
    slug: str,
    previous_briefs: list[dict[str, object]],
    recent_editorials: list[dict[str, object]],
) -> str:
    for brief in previous_briefs:
        if not _branch_theme_match(slug, theme_name, brief):
            continue
        meta = brief.get("meta") if isinstance(brief.get("meta"), dict) else {}
        dialectic = meta.get("dialectic") if isinstance(meta.get("dialectic"), dict) else {}
        open_loops = meta.get("open_loops") if isinstance(meta.get("open_loops"), list) else []
        title = _branch_clean_text(brief.get("title") or brief.get("label") or theme_name)
        next_thread = _branch_clean_text(dialectic.get("gold_thread") or (open_loops[0] if open_loops else ""))
        if next_thread:
            return f"Extend '{title}' by testing this unresolved thread: {next_thread}"
        return f"Extend '{title}' instead of restarting the {theme_name} lane."

    for editorial in recent_editorials:
        if not _branch_theme_match(slug, theme_name, editorial):
            continue
        title = _branch_clean_text(editorial.get("selected_angle") or editorial.get("title") or theme_name)
        return f"Connect back to the recent BAT piece '{title}' and move the lane one step forward."

    return f"Treat {theme_name or slug.replace('-', ' ').title()} as a continuing research lane; connect fresh sources to the last known pattern before drafting."


def _research_content_branches(
    *,
    query_plan: list[str],
    themes: list[Theme],
    opportunity_board: list[dict[str, object]],
    previous_briefs: list[dict[str, object]],
    recent_editorials: list[dict[str, object]],
    limit: int = 6,
) -> list[dict[str, object]]:
    opportunity_by_slug = {str(item.get("slug") or ""): item for item in opportunity_board}
    branches: list[dict[str, object]] = []
    for theme in themes[: max(1, limit)]:
        theme_name = _branch_clean_text(getattr(theme, "name", "")) or "Sitewide"
        slug = _branch_clean_text(getattr(theme, "slug", "")) or slugify_theme_name(theme_name)
        opportunity = opportunity_by_slug.get(slug) or {}
        seed_query = _branch_seed_query(theme_name=theme_name, slug=slug, query_plan=query_plan, opportunity=opportunity)
        angle = _branch_clean_text(opportunity.get("angle") or theme_name)
        previous_connection = _branch_previous_connection(
            theme_name=theme_name,
            slug=slug,
            previous_briefs=previous_briefs,
            recent_editorials=recent_editorials,
        )
        next_queries = _dedupe_keep_order(
            [
                seed_query,
                f"{seed_query} challenge official line contradiction",
                f"{theme_name} who benefits who absorbs the cost {settings.current_news_min_year}",
                f"{theme_name} consequence backlash receipts {settings.current_news_min_year}",
            ],
            limit=4,
        )
        branches.append(
            {
                "theme": theme_name,
                "slug": slug,
                "score": float(getattr(theme, "active_score", 0) or 0),
                "seed_query": seed_query,
                "previous_connection": previous_connection,
                "angle": angle,
                "next_research_queries": next_queries[1:] or next_queries,
                "writer_prompt": (
                    f"Writer branch for {theme_name}: {previous_connection} "
                    f"Use the next research to challenge '{angle}' before landing the synthesis."
                ),
            }
        )
    return branches


def slugify_theme_name(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "sitewide"



def _story_card(obj: EditorialObject | None) -> dict[str, object] | None:
    if not obj:
        return None
    metadata = obj.meta or {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
    return {
        "id": str(obj.id),
        "slug": obj.slug,
        "title": obj.title,
        "status": obj.status,
        "object_type": obj.object_type,
        "story_form": metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else None),
        "story_mode": metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else None),
        "theme_slug": metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else None),
        "word_count": metadata.get("word_count"),
        "selected_angle": launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else None,
        "why_now": launch_packet.get("why_now") if isinstance(launch_packet, dict) else None,
        "pattern_signals": launch_packet.get("pattern_signals", [])[:3] if isinstance(launch_packet, dict) else [],
        "social_hooks": launch_packet.get("social_hooks", [])[:3] if isinstance(launch_packet, dict) else [],
        "source_mix": metadata.get("source_mix") if isinstance(metadata, dict) else None,
    }


def _live_priority_queries() -> list[str]:
    year = settings.current_news_min_year
    return [
        f"Trump Iran war latest {year}",
        f"White House Iran strike fallout {year}",
        f"Congress war powers Trump Iran {year}",
        f"oil prices Iran conflict Trump {year}",
        f"Pentagon Middle East escalation latest {year}",
    ]


def _clean_follow_up_query(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if not cleaned or "..." in cleaned:
        return ""
    cleaned = OUTLET_SUFFIX_RE.sub("", cleaned).strip(" -:|")
    lowered = cleaned.lower()
    if any(marker in lowered for marker in EMERGENT_REJECT_MARKERS):
        return ""
    if not any(marker in lowered for marker in EMERGENT_HEAT_MARKERS):
        return ""
    words = cleaned.split()
    if len(words) > 12:
        cleaned = " ".join(words[:12])
    if len(cleaned) < 24:
        return ""
    if str(settings.current_news_min_year) not in cleaned:
        cleaned = f"{cleaned} {settings.current_news_min_year}"
    return cleaned[:180]


async def _emergent_live_queries(db: AsyncSession, *, limit: int = 6) -> list[str]:
    rows = (await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(40))).scalars().all()
    candidates: list[str] = []
    for source in rows:
        metadata = source.meta or {}
        assessment = source_current_news_assessment(source)
        if float(metadata.get("quality_score") or 0) < 4.2:
            continue
        if not bool(assessment.get("current_news_eligible")):
            continue
        if str(assessment.get("source_kind") or "other") not in {"reporting", "institutional"}:
            continue
        if not has_bat_focus(
            source.title,
            str(metadata.get("search_snippet") or ""),
            str(metadata.get("query_original") or ""),
            source.raw_text,
        ):
            continue
        title_query = _clean_follow_up_query(source.title or "")
        if title_query:
            candidates.append(title_query)
        original_query = _clean_follow_up_query(str(metadata.get("query_original") or metadata.get("query") or ""))
        if original_query:
            candidates.append(original_query)
    return _dedupe_keep_order(candidates, limit=limit)


def _opportunity_angle(theme: Theme) -> str:
    slug = str(theme.slug or "")
    if slug in {"foreign-policy-escalation", "military-brinkmanship"}:
        return f"{theme.name} live watch"
    if slug in {"allied-anxiety", "energy-shock-politics"}:
        return f"{theme.name} fallout watch"
    if slug == "war-room-narrative-spin":
        return f"{theme.name} messaging watch"
    return f"{theme.name} contradiction watch"


def _theme_live_query(theme: Theme) -> str:
    theme_name = _clean_follow_up_query(str(theme.name or "")) or re.sub(r"\s+", " ", str(theme.name or "")).strip()
    if not theme_name:
        return ""
    theme_slug = str(theme.slug or "").strip().lower()
    theme_hint = re.sub(r"\s+", " ", RESEARCH_THEME_QUERY_HINTS.get(theme_slug, "")).strip()
    parts = [f"Trump {theme_name}", theme_hint, "latest", str(settings.current_news_min_year)]
    return re.sub(r"\s+", " ", " ".join(part for part in parts if part)).strip()[:180]


def _theme_active_score(theme: Theme) -> float:
    try:
        return float(theme.active_score or 0)
    except (TypeError, ValueError):
        return 0.0


def _writer_branch_limit(theme_pool: list[Theme]) -> tuple[int, int]:
    base_limit = max(3, int(settings.writer_theme_take_limit))
    hot_theme_count = sum(1 for theme in theme_pool if _theme_active_score(theme) >= 0.75)
    branch_limit = min(8, max(base_limit, hot_theme_count))
    return branch_limit, hot_theme_count


def _brief_meta(brief: dict[str, object] | None) -> dict[str, object]:
    if not isinstance(brief, dict):
        return {}
    meta = brief.get("meta")
    return meta if isinstance(meta, dict) else {}


def _writer_priority_score(theme: Theme, brief: dict[str, object] | None) -> float:
    active_score = _theme_active_score(theme)
    if not isinstance(brief, dict):
        return round(active_score, 3)
    meta = _brief_meta(brief)
    topic_stats = meta.get("topic_stats") if isinstance(meta.get("topic_stats"), dict) else {}
    story_targets = meta.get("story_targets") if isinstance(meta.get("story_targets"), dict) else {}
    dialectic = meta.get("dialectic") if isinstance(meta.get("dialectic"), dict) else {}
    freshest_age_days = topic_stats.get("freshest_age_days")
    lane_alignment_ratio = float(topic_stats.get("lane_alignment_ratio") or 0)
    confidence = float(brief.get("confidence") or 0)
    source_count = int(brief.get("source_count") or 0)
    story_target = str(story_targets.get("long_form") or "").strip().lower()
    gold_thread = str(dialectic.get("gold_thread") or "").strip()

    score = active_score * 2.2
    score += confidence * 1.8
    score += min(source_count, 6) * 0.12
    score += lane_alignment_ratio * 0.9
    if freshest_age_days is not None and int(freshest_age_days or 99) <= 1:
        score += 0.45
    if story_target in {"theme_update", "notebook_entry"}:
        score += 0.35
    if gold_thread:
        score += 0.35
    if lane_alignment_ratio and lane_alignment_ratio < 0.34:
        score -= 0.9
    return round(score, 3)


def _writer_priority_fingerprint(item: dict[str, object]) -> str:
    for key in ("selected_angle", "gold_thread", "theme"):
        raw = str(item.get(key) or "").strip()
        if not raw:
            continue
        quoted = re.search(r"['\"]([^'\"]{20,180})['\"]", raw)
        candidate = quoted.group(1) if quoted else raw
        fingerprint = re.sub(r"[^a-z0-9]+", " ", candidate.lower()).strip()
        if fingerprint:
            return fingerprint
    return ""


def _select_distinct_priority_items(
    priority_board: list[dict[str, object]],
    *,
    theme_by_slug: dict[str, Theme],
    limit: int,
) -> tuple[list[dict[str, object]], int]:
    selected: list[dict[str, object]] = []
    deferred: list[dict[str, object]] = []
    seen_signals: set[str] = set()

    for item in priority_board:
        slug = str(item.get("slug") or "")
        if slug not in theme_by_slug:
            continue
        signal = _writer_priority_fingerprint(item)
        if signal and signal in seen_signals:
            deferred.append(item)
            continue
        if signal:
            seen_signals.add(signal)
        selected.append(item)
        if len(selected) >= limit:
            return selected, len(deferred)

    for item in deferred:
        selected.append(item)
        if len(selected) >= limit:
            break

    return selected, len(deferred)


async def _writer_theme_priority_board(db: AsyncSession, theme_pool: list[Theme]) -> list[dict[str, object]]:
    session_isolation = _supports_isolated_sessions(db)
    board: list[dict[str, object]] = []
    priority_concurrency = int(settings.writer_theme_concurrency) if session_isolation else 1

    async def _build_priority(theme: Theme) -> dict[str, object]:
        brief = await _run_db_task(
            db,
            lambda session: select_analysis_brief(
                session,
                theme_slug=theme.slug,
                query_text=f"Trump {theme.name} latest {settings.current_news_min_year}",
                scope_type="theme",
            ),
            isolated=session_isolation,
        )
        meta = _brief_meta(brief)
        topic_stats = meta.get("topic_stats") if isinstance(meta.get("topic_stats"), dict) else {}
        story_targets = meta.get("story_targets") if isinstance(meta.get("story_targets"), dict) else {}
        dialectic = meta.get("dialectic") if isinstance(meta.get("dialectic"), dict) else {}
        confidence = float((brief or {}).get("confidence") or 0)
        freshest_age_days = topic_stats.get("freshest_age_days")
        lane_alignment_ratio = float(topic_stats.get("lane_alignment_ratio") or 0)
        gold_thread = str(dialectic.get("gold_thread") or "").strip()
        gold_ready = bool(
            gold_thread
            and confidence >= 0.72
            and lane_alignment_ratio >= 0.34
            and freshest_age_days is not None
            and int(freshest_age_days or 99) <= 1
        )
        return {
            "slug": theme.slug,
            "theme": theme.name,
            "active_score": _theme_active_score(theme),
            "writer_score": _writer_priority_score(theme, brief),
            "confidence": confidence,
            "lane_alignment_ratio": lane_alignment_ratio,
            "story_target": str(story_targets.get("long_form") or "").strip().lower() or None,
            "selected_angle": (brief or {}).get("title") if isinstance(brief, dict) else None,
            "gold_thread": gold_thread or None,
            "gold_ready": gold_ready,
        }

    outcomes = await _gather_limited(
        theme_pool,
        _build_priority,
        limit=priority_concurrency,
        return_exceptions=True,
    )
    for theme, outcome in zip(theme_pool, outcomes, strict=True):
        if isinstance(outcome, Exception):
            error = str(outcome)
            log_event(
                logger,
                "pipeline.writer.priority_failed",
                level=40,
                theme=theme.slug,
                error=error,
            )
            board.append(
                {
                    "slug": theme.slug,
                    "theme": theme.name,
                    "active_score": _theme_active_score(theme),
                    "writer_score": _writer_priority_score(theme, None),
                    "confidence": 0.0,
                    "lane_alignment_ratio": 0.0,
                    "story_target": None,
                    "selected_angle": None,
                    "gold_thread": None,
                    "gold_ready": False,
                    "error": error,
                }
            )
            continue
        board.append(outcome)
    board.sort(key=lambda item: float(item.get("writer_score") or 0), reverse=True)
    return board


def _writer_source_ready(source: Source) -> bool:
    assessment = source_current_news_assessment(source)
    if str(assessment.get("source_kind") or "other").lower() not in {"reporting", "institutional"}:
        return False
    if not bool(assessment.get("current_news_eligible")):
        return False
    if int(assessment.get("age_days") if assessment.get("age_days") is not None else 9999) > int(settings.current_news_max_age_days):
        return False
    if float((source.meta or {}).get("quality_score") or 0) < max(float(settings.retrieval_min_quality_score), 4.8):
        return False
    title = str(source.title or "").strip()
    if not title or title.endswith("...") or "..." in title:
        return False
    return has_bat_focus(
        source.title,
        str((source.meta or {}).get("search_snippet") or ""),
        str((source.meta or {}).get("query_original") or ""),
        source.raw_text,
    )


async def _writer_material_snapshot(db: AsyncSession, *, limit: int = 80) -> dict[str, object]:
    rows = (
        await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(limit))
    ).scalars().all()
    ready_sources = [row for row in rows if _writer_source_ready(row)]
    sample_titles = _dedupe_keep_order(
        [
            re.sub(r"\s+", " ", str(row.title or "")).strip()
            for row in ready_sources
            if str(row.title or "").strip()
        ],
        limit=3,
    )
    freshest_ready_age_days = min(
        (
            int(source_current_news_assessment(row).get("age_days") or 0)
            for row in ready_sources
            if source_current_news_assessment(row).get("age_days") is not None
        ),
        default=None,
    )
    return {
        "ready_source_count": len(ready_sources),
        "freshest_ready_age_days": freshest_ready_age_days,
        "sample_titles": sample_titles,
    }


async def _load_top_themes(db: AsyncSession, *, limit: int) -> list[Theme]:
    return (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(limit))).scalars().all()

async def _research_branch_context(db: AsyncSession) -> dict[str, list[dict[str, object]]]:
    brief_rows = (
        await db.execute(
            select(AnalysisBrief)
            .where(AnalysisBrief.status == "active")
            .order_by(AnalysisBrief.updated_at.desc())
            .limit(12)
        )
    ).scalars().all()
    editorial_rows = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status.in_(["draft", "approved", "published"]))
            .order_by(EditorialObject.created_at.desc())
            .limit(12)
        )
    ).scalars().all()
    previous_briefs = [
        {
            "scope_key": row.scope_key,
            "label": row.label,
            "title": row.title,
            "meta": row.meta or {},
        }
        for row in brief_rows
    ]
    recent_editorials = []
    for row in editorial_rows:
        meta = row.meta or {}
        story_brief = meta.get("story_brief") if isinstance(meta.get("story_brief"), dict) else {}
        launch_packet = meta.get("launch_packet") if isinstance(meta.get("launch_packet"), dict) else {}
        recent_editorials.append(
            {
                "title": row.title,
                "theme_slug": meta.get("theme_slug") or story_brief.get("theme_slug"),
                "selected_angle": meta.get("selected_angle") or launch_packet.get("selected_angle"),
                "story_form": meta.get("story_form") or story_brief.get("story_form"),
            }
        )
    return {"previous_briefs": previous_briefs, "recent_editorials": recent_editorials}



def _writer_should_run(researcher_summary: dict[str, object], analyst_summary: dict[str, object]) -> tuple[bool, str]:
    fresh_sources = int(researcher_summary.get("source_created", 0)) + int(researcher_summary.get("source_updated", 0))
    if fresh_sources > 0 or int(researcher_summary.get("high_quality_kept", 0)) > 0:
        return True, "fresh_ingest"

    material_snapshot = (
        researcher_summary.get("writer_material") if isinstance(researcher_summary.get("writer_material"), dict) else {}
    )
    ready_source_count = int(material_snapshot.get("ready_source_count") or 0)
    if ready_source_count >= max(2, int(settings.generation_min_grounded_sources)):
        return True, "cached_current_sources"

    site_brief = analyst_summary.get("site_brief") if isinstance(analyst_summary.get("site_brief"), dict) else {}
    site_confidence = float(site_brief.get("confidence") or 0)
    theme_briefs = analyst_summary.get("theme_briefs") if isinstance(analyst_summary.get("theme_briefs"), list) else []
    high_confidence_theme_count = sum(1 for item in theme_briefs if float((item or {}).get("confidence") or 0) >= 0.78)
    if ready_source_count >= 1 and (site_confidence >= 0.72 or high_confidence_theme_count >= 2):
        return True, "analysis_ready_on_cached_sources"

    return False, "no_current_writer_material"


async def _build_research_query_plan(db: AsyncSession, controls: dict) -> list[str]:
    directive_queries = _search_safe_directive_queries(controls, "research_directive")
    live_priority_queries = _live_priority_queries()
    emergent_live_queries = await _emergent_live_queries(db)
    baseline_queries = [
        f"Trump latest court fight {settings.current_news_min_year}",
        f"Trump White House contradiction {settings.current_news_min_year}",
        f"Republican backlash Trump {settings.current_news_min_year}",
        f"Trump Iran war latest {settings.current_news_min_year}",
        f"White House Iran strike fallout {settings.current_news_min_year}",
    ]
    top_themes = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(6))).scalars().all()
    theme_queries = [_theme_live_query(theme) for theme in top_themes if theme.name and float(theme.active_score or 0) > 0]
    if directive_queries:
        full_plan = (
            directive_queries
            + live_priority_queries
            + emergent_live_queries
            + theme_queries
            + baseline_queries
            + list(settings.query_pack)
        )
        return _dedupe_keep_order(full_plan, limit=30)

    full_plan = live_priority_queries + emergent_live_queries + theme_queries + baseline_queries + list(settings.query_pack)
    return _dedupe_keep_order(full_plan, limit=24)


async def _build_analysis_query_plan(db: AsyncSession, controls: dict) -> list[str]:
    directive_queries = _search_safe_directive_queries(controls, "analysis_directive", "research_directive")
    live_priority_queries = _live_priority_queries()
    emergent_live_queries = await _emergent_live_queries(db)
    baseline_queries = [
        f"Trump contradiction latest {settings.current_news_min_year}",
        f"White House spin fallout latest {settings.current_news_min_year}",
        f"Trump legal conflict latest {settings.current_news_min_year}",
        f"Trump Iran escalation latest {settings.current_news_min_year}",
    ]
    top_themes = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(6))).scalars().all()
    theme_queries = [_theme_live_query(theme) for theme in top_themes if theme.name and float(theme.active_score or 0) > 0]
    if directive_queries:
        full_plan = directive_queries + theme_queries + live_priority_queries + emergent_live_queries + baseline_queries
        return _dedupe_keep_order(full_plan + list(settings.query_pack), limit=26)
    return await _build_research_query_plan(db, controls)


async def _log_pipeline_event(
    db: AsyncSession,
    *,
    cycle_id: uuid.UUID,
    action: str,
    actor: str,
    snapshot: dict | None = None,
) -> None:
    log_event(
        logger,
        "pipeline.event",
        cycle_id=str(cycle_id),
        action=action,
        actor=actor,
        snapshot=_json_safe(snapshot or {}),
    )
    await record_revision(
        db,
        object_table="pipeline_cycle",
        object_id=cycle_id,
        action=action,
        actor=actor,
        snapshot=_json_safe(snapshot or {}),
    )


async def _acquire_pipeline_lock(cycle_id: uuid.UUID, actor: str) -> tuple[bool, redis.Redis | None, str]:
    token = f"{cycle_id}:{actor}"
    client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        acquired = await client.set(
            PIPELINE_LOCK_KEY,
            token,
            nx=True,
            ex=max(60, int(settings.pipeline_lock_ttl_seconds)),
        )
        if acquired:
            return True, client, token
        await client.aclose()
        return False, None, token
    except Exception as exc:  # noqa: BLE001
        await client.aclose()
        log_event(logger, "pipeline.lock_unavailable", level=40, error=str(exc))
        return True, None, token


async def _release_pipeline_lock(client: redis.Redis | None, token: str) -> None:
    if client is None:
        return
    try:
        current = await client.get(PIPELINE_LOCK_KEY)
        if current == token:
            await client.delete(PIPELINE_LOCK_KEY)
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "pipeline.lock_release_failed", level=40, error=str(exc))
    finally:
        await client.aclose()


async def run_researcher_cycle(db: AsyncSession) -> dict:
    controls = await get_runtime_controls(db)
    query_plan = await _build_research_query_plan(db, controls)
    session_isolation = _supports_isolated_sessions(db)
    research_concurrency = int(settings.research_query_concurrency) if session_isolation else 1
    aggressive_mode = len(_split_directive_queries(controls.get("research_directive", ""))) >= 6
    per_query_limit = 14 if aggressive_mode else 10
    query_failures: list[dict[str, str]] = []

    async def _run_research_query(query: str) -> dict:
        return await _run_db_task(
            db,
            lambda session: ingest_query(session, query=query, limit=per_query_limit),
            isolated=session_isolation,
        )

    summary_outcomes = await _gather_limited(
        query_plan,
        _run_research_query,
        limit=research_concurrency,
        return_exceptions=True,
    )
    summaries: list[dict] = []
    for query, outcome in zip(query_plan, summary_outcomes, strict=True):
        if isinstance(outcome, Exception):
            error = str(outcome)
            query_failures.append({"query": query, "error": error})
            log_event(
                logger,
                "pipeline.researcher.query_failed",
                level=40,
                query=query,
                error=error,
            )
            continue
        summaries.append(outcome)

    x_summaries: list[dict] = []
    x_query_failures: list[dict[str, str]] = []
    x_concurrency = int(settings.research_x_query_concurrency) if session_isolation else 1
    if controls["x_research_enabled"]:
        x_limit = max(4, min(10, int(settings.x_search_max_results)))
        x_queries = query_plan[:10]

        async def _run_x_query(query: str) -> dict:
            return await _run_db_task(
                db,
                lambda session: ingest_x_query(session, query=query, limit=x_limit),
                isolated=session_isolation,
            )

        x_outcomes = await _gather_limited(
            x_queries,
            _run_x_query,
            limit=x_concurrency,
            return_exceptions=True,
        )
        for query, outcome in zip(x_queries, x_outcomes, strict=True):
            if isinstance(outcome, Exception):
                error = str(outcome)
                x_query_failures.append({"query": query, "error": error})
                log_event(
                    logger,
                    "pipeline.researcher.x_query_failed",
                    level=40,
                    query=query,
                    error=error,
                )
                continue
            x_summaries.append(outcome)

    if session_isolation:
        trend_summary, writer_material = await asyncio.gather(
            _run_db_task(db, rebuild_themes, isolated=True),
            _run_db_task(db, lambda session: _writer_material_snapshot(session), isolated=True),
        )
        top_themes = await _run_db_task(db, lambda session: _load_top_themes(session, limit=6), isolated=True)
    else:
        trend_summary = await _run_db_task(db, rebuild_themes, isolated=False)
        writer_material = await _run_db_task(db, lambda session: _writer_material_snapshot(session), isolated=False)
        top_themes = await _run_db_task(db, lambda session: _load_top_themes(session, limit=6), isolated=False)
    opportunity_board = [
        {
            "theme": theme.name,
            "slug": theme.slug,
            "score": float(theme.active_score or 0),
            "angle": _opportunity_angle(theme),
            "query_hint": next(
                (query for query in query_plan if theme.name.lower().split(" ")[0] in query.lower()),
                query_plan[0] if query_plan else "",
            ),
        }
        for theme in top_themes
    ]
    branch_context = await _run_db_task(db, _research_branch_context, isolated=session_isolation)
    content_branches = _research_content_branches(
        query_plan=query_plan,
        themes=top_themes,
        opportunity_board=opportunity_board,
        previous_briefs=list(branch_context.get("previous_briefs") or []),
        recent_editorials=list(branch_context.get("recent_editorials") or []),
        limit=max(4, len(top_themes)),
    )
    source_created = sum(int(s.get("created", 0)) for s in summaries)
    source_updated = sum(int(s.get("updated", 0)) for s in summaries)
    high_quality_kept = sum(int(s.get("high_quality_kept", 0)) for s in summaries)
    x_source_created = sum(int(s.get("created", 0)) for s in x_summaries)
    x_source_updated = sum(int(s.get("updated", 0)) for s in x_summaries)
    await update_voice_memory(
        db,
        memory_type="pipeline",
        key="researcher_last_cycle",
        value=(
            f"Completed at {datetime.utcnow().isoformat()} UTC | queries={len(query_plan)} "
            f"| x_enabled={controls['x_research_enabled']} | branches={len(content_branches)}"
        ),
        weight=1.0,
    )
    await update_voice_memory(
        db,
        memory_type="pipeline",
        key="research_content_paths",
        value=json.dumps(content_branches[:6], ensure_ascii=True),
        weight=1.12,
    )
    return {
        "role": "researcher",
        "plugins": _role_plugins("researcher"),
        "aggressive_mode": aggressive_mode,
        "per_query_limit": per_query_limit,
        "research_query_concurrency": research_concurrency,
        "query_count": len(query_plan),
        "query_plan": query_plan,
        "research_query_failure_count": len(query_failures),
        "research_query_failures": query_failures[:6],
        "source_created": source_created,
        "source_updated": source_updated,
        "high_quality_kept": high_quality_kept,
        "x_query_concurrency": x_concurrency if controls["x_research_enabled"] else 0,
        "x_query_failure_count": len(x_query_failures),
        "x_query_failures": x_query_failures[:6],
        "x_source_created": x_source_created,
        "x_source_updated": x_source_updated,
        "themes_active": int(trend_summary.get("themes", 0)),
        "theme_memberships": int(trend_summary.get("memberships", 0)),
        "opportunity_board": opportunity_board,
        "content_branches": content_branches,
        "writer_material": writer_material,
        "source_quality_mix": {
            "fresh_sources": source_created + source_updated,
            "high_quality_kept": high_quality_kept,
            "x_sources": x_source_created + x_source_updated,
            "writer_ready_sources": int(writer_material.get("ready_source_count") or 0),
        },
    }


async def run_analyst_cycle(db: AsyncSession) -> dict:
    controls = await get_runtime_controls(db)
    directive_queries = _search_safe_directive_queries(controls, "analysis_directive", "research_directive")
    query_plan = await _build_analysis_query_plan(db, controls)
    analysis_summary = await refresh_analysis_briefs(
        db,
        query_plan=query_plan,
        directive_queries=directive_queries or None,
    )
    site_brief = analysis_summary.get("site_brief") or {}
    theme_briefs = analysis_summary.get("theme_briefs") or []
    await update_voice_memory(
        db,
        memory_type="pipeline",
        key="analyst_last_cycle",
        value=(
            f"Completed at {datetime.utcnow().isoformat()} UTC | briefs={int(analysis_summary.get('brief_count') or 0)} "
            f"| tone_modes={len(analysis_summary.get('tone_distribution') or {})}"
        ),
        weight=1.05,
    )
    return {
        "role": "analyst",
        "plugins": _role_plugins("analyst"),
        "query_count": len(query_plan),
        "directive_queries": directive_queries[:4],
        "site_brief": {
            "label": site_brief.get("label"),
            "title": site_brief.get("title"),
            "confidence": site_brief.get("confidence"),
            "updated_at": site_brief.get("updated_at"),
        },
        "theme_briefs": [
            {
                "scope_key": brief.get("scope_key"),
                "label": brief.get("label"),
                "title": brief.get("title"),
                "confidence": brief.get("confidence"),
            }
            for brief in theme_briefs
        ],
        "brief_count": int(analysis_summary.get("brief_count") or 0),
        "brief_failure_count": int(analysis_summary.get("brief_failure_count") or 0),
        "brief_failures": list(analysis_summary.get("brief_failures") or [])[:4],
        "tone_distribution": analysis_summary.get("tone_distribution") or {},
        "role_distribution": analysis_summary.get("role_distribution") or {},
        "story_target_distribution": analysis_summary.get("story_target_distribution") or {},
    }


async def run_writer_cycle(db: AsyncSession) -> dict:
    controls = await get_runtime_controls(db)
    should_publish = bool(controls["direct_publish"])
    session_isolation = _supports_isolated_sessions(db)
    theme_generation_concurrency = int(settings.writer_theme_concurrency) if session_isolation else 1
    lead: EditorialObject | None = None
    lead_failure: str | None = None
    priority_board: list[dict[str, object]] = []
    theme_pool = await _load_top_themes(db, limit=max(8, int(settings.writer_theme_take_limit) + 3))
    branch_limit, hot_theme_count = _writer_branch_limit(theme_pool)

    async def _build_lead_story() -> EditorialObject:
        return await _run_db_task(
            db,
            lambda session: generate_editorial_object(session, object_type="lead_story", publish_now=should_publish),
            isolated=session_isolation,
        )

    if session_isolation:
        lead_outcome, priority_outcome = await asyncio.gather(
            _build_lead_story(),
            _writer_theme_priority_board(db, theme_pool),
            return_exceptions=True,
        )
    else:
        try:
            lead_outcome = await _build_lead_story()
        except Exception as exc:
            lead_outcome = exc
        try:
            priority_outcome = await _writer_theme_priority_board(db, theme_pool)
        except Exception as exc:
            priority_outcome = exc

    if isinstance(lead_outcome, Exception):
        lead_failure = str(lead_outcome)
        log_event(
            logger,
            "pipeline.writer.lead_failed",
            level=40,
            error=lead_failure,
        )
    else:
        lead = lead_outcome

    if isinstance(priority_outcome, Exception):
        log_event(
            logger,
            "pipeline.writer.priority_board_failed",
            level=40,
            error=str(priority_outcome),
        )
    else:
        priority_board = priority_outcome

    gold_theme_count = sum(1 for item in priority_board if bool(item.get("gold_ready")))
    effective_branch_limit = min(8, branch_limit + min(2, gold_theme_count))
    theme_by_slug = {str(theme.slug): theme for theme in theme_pool}
    selected_priority_items, duplicate_signal_count = _select_distinct_priority_items(
        priority_board,
        theme_by_slug=theme_by_slug,
        limit=effective_branch_limit,
    )
    top_themes = [theme_by_slug[str(item.get("slug"))] for item in selected_priority_items]
    if not top_themes:
        top_themes = theme_pool[:branch_limit]
        duplicate_signal_count = 0
    theme_drafts: list[dict[str, object]] = []
    theme_failures: list[dict[str, str]] = []
    theme_story_cards: list[dict[str, object]] = []

    async def _build_theme_take(theme: Theme) -> EditorialObject:
        return await _run_db_task(
            db,
            lambda session: generate_editorial_object(
                session,
                object_type="theme_take",
                theme_slug=theme.slug,
                publish_now=should_publish,
            ),
            isolated=session_isolation,
        )

    theme_outcomes = await _gather_limited(
        top_themes,
        _build_theme_take,
        limit=theme_generation_concurrency,
        return_exceptions=True,
    )
    for theme, outcome in zip(top_themes, theme_outcomes, strict=True):
        if isinstance(outcome, Exception):
            failure = {"theme": theme.slug, "error": str(outcome)}
            theme_failures.append(failure)
            log_event(
                logger,
                "pipeline.writer.theme_failed",
                level=40,
                theme=theme.slug,
                error=failure["error"],
            )
            continue
        draft = outcome
        theme_drafts.append({"id": str(draft.id), "theme": theme.slug, "status": draft.status})
        card = _story_card(draft)
        if card:
            theme_story_cards.append(card)

    homepage: HomepageSnapshot | None = None
    homepage_failure: str | None = None
    try:
        homepage = await _run_db_task(
            db,
            lambda session: generate_homepage_snapshot(session, publish_now=should_publish),
            isolated=session_isolation,
        )
    except Exception as exc:
        homepage_failure = str(exc)
        log_event(
            logger,
            "pipeline.writer.homepage_failed",
            level=40,
            error=homepage_failure,
        )

    if lead is None and not theme_drafts and homepage is None:
        raise RuntimeError(lead_failure or homepage_failure or "writer_cycle_produced_no_assets")

    story_slate = [card for card in [_story_card(lead), *theme_story_cards] if card]
    await update_voice_memory(
        db,
        memory_type="pipeline",
        key="writer_last_cycle",
        value=(
            f"Completed at {datetime.utcnow().isoformat()} UTC | direct_publish={should_publish} "
            f"| branches={len(theme_drafts)} | branch_failures={len(theme_failures)} "
            f"| hot_themes={hot_theme_count} | gold_themes={gold_theme_count}"
        ),
        weight=1.0,
    )

    return {
        "role": "writer",
        "plugins": _role_plugins("writer"),
        "direct_publish": should_publish,
        "theme_generation_concurrency": theme_generation_concurrency,
        "theme_branch_limit": branch_limit,
        "effective_theme_branch_limit": effective_branch_limit,
        "hot_theme_count": hot_theme_count,
        "gold_theme_count": gold_theme_count,
        "theme_candidates": len(theme_pool),
        "theme_priority_board": priority_board[:6],
        "theme_duplicate_signal_count": duplicate_signal_count,
        "lead_story_id": str(lead.id) if lead else None,
        "lead_story_status": lead.status if lead else "failed",
        "lead_story_error": lead_failure,
        "theme_take_ids": theme_drafts,
        "theme_failures": theme_failures,
        "homepage_snapshot_id": str(homepage.id) if homepage else None,
        "homepage_status": homepage.status if homepage else "failed",
        "homepage_error": homepage_failure,
        "story_slate": story_slate,
        "homepage_angle": ((homepage.layout_json or {}) if homepage else {}).get("lead_angle"),
        "launch_packets": [
            {
                "story_id": card.get("id"),
                "title": card.get("title"),
                "selected_angle": card.get("selected_angle"),
                "why_now": card.get("why_now"),
            }
            for card in story_slate
        ],
    }


async def run_queen_cycle(db: AsyncSession, *, writer_summary: dict) -> dict:
    controls = await get_runtime_controls(db)
    direct_publish = bool(controls["direct_publish"])
    auto_publish_editorials = direct_publish or (settings.auto_publish and not settings.enable_manual_review)
    lead_story_id = writer_summary.get("lead_story_id")
    homepage_snapshot_id = writer_summary.get("homepage_snapshot_id")
    social_count = 0
    auto_published = {"editorial": 0, "homepage": 0, "social": 0}
    queue_limit = max(6, int(settings.writer_theme_take_limit), int(settings.editorial_rework_queue_limit))
    backlog_rework = await rework_editorial_backlog(db, limit=queue_limit)
    backlog_publish: dict[str, Any] = {
        "ok": True,
        "rework": {
            "ok": True,
            "candidate_count": 0,
            "reworked_editorial_count": 0,
            "reworked_editorials": [],
            "publish_ready_editorial_ids": [],
            "failure_count": 0,
            "failures": [],
            "skipped": [],
        },
        "reworked_editorial_count": 0,
        "reworked_editorial_ids": [],
        "published_editorial_count": 0,
        "published_editorial_ids": [],
        "published_social_count": 0,
        "published_social_ids": [],
        "homepage_snapshot_id": None,
        "homepage_status": None,
    }
    lead_story: EditorialObject | None = None
    if lead_story_id:
        lead_story = (
            await db.execute(select(EditorialObject).where(EditorialObject.id == uuid.UUID(str(lead_story_id))))
        ).scalar_one_or_none()

    social_error: str | None = None
    if lead_story:
        try:
            social_posts = await generate_social_posts(db, lead_story, publish_now=direct_publish)
            social_count = len(social_posts)
            if direct_publish:
                dispatch_outcomes = await _gather_limited(
                    social_posts,
                    lambda post: dispatch_social_post(post, force_dry_run=not controls["x_live_posting"]),
                    limit=int(settings.social_dispatch_concurrency),
                    return_exceptions=True,
                )
                for post, outcome in zip(social_posts, dispatch_outcomes, strict=True):
                    publish_response = (
                        outcome
                        if not isinstance(outcome, Exception)
                        else {"mode": "dry-run", "ok": True, "fallback": True, "error": str(outcome)}
                    )
                    post.meta = {**(post.meta or {}), "publish_response": publish_response}
                await db.commit()
                auto_published["social"] += len(social_posts)
        except Exception as exc:
            social_error = str(exc)
            log_event(
                logger,
                "pipeline.queen.social_failed",
                level=40,
                lead_story_id=str(lead_story.id),
                error=social_error,
            )

    curated_sources = (
        await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(max(12, int(settings.queen_curation_limit) * 4)))
    ).scalars().all()
    curated_links = _curate_source_links(
        curated_sources,
        limit=max(3, int(settings.queen_curation_limit)),
        min_quality=max(float(settings.retrieval_min_quality_score), 5.0),
    )

    homepage_error: str | None = None

    async def _annotate_homepage_snapshot(snapshot_id: str | None) -> None:
        nonlocal homepage_error
        if not snapshot_id:
            return
        try:
            snapshot = (
                await db.execute(select(HomepageSnapshot).where(HomepageSnapshot.id == uuid.UUID(str(snapshot_id))))
            ).scalar_one_or_none()
            if snapshot:
                layout = dict(snapshot.layout_json or {})
                layout["queen_links"] = curated_links
                layout["queen_label"] = "What I'm Keeping Open"
                snapshot.layout_json = layout

                if direct_publish and snapshot.status != "published":
                    snapshot.status = "published"
                    snapshot.published_at = datetime.utcnow()
                    auto_published["homepage"] = 1
                elif settings.auto_publish and not settings.enable_manual_review and snapshot.status != "published":
                    snapshot.status = "published"
                    snapshot.published_at = datetime.utcnow()
                    auto_published["homepage"] = 1

                await db.commit()
        except Exception as exc:
            homepage_error = str(exc)
            log_event(
                logger,
                "pipeline.queen.homepage_failed",
                level=40,
                homepage_snapshot_id=str(snapshot_id),
                error=homepage_error,
            )

    await _annotate_homepage_snapshot(homepage_snapshot_id)

    if auto_publish_editorials:
        refresh_backlog_homepage = not bool(homepage_snapshot_id)
        backlog_publish = await publish_ready_backlog(
            db,
            limit=queue_limit,
            publish_social=True,
            rework_drafts=False,
            refresh_homepage=refresh_backlog_homepage,
        )
        auto_published["editorial"] += int(backlog_publish.get("published_editorial_count") or 0)
        auto_published["social"] += int(backlog_publish.get("published_social_count") or 0)
        if str(backlog_publish.get("homepage_status") or "") == "published":
            auto_published["homepage"] = max(auto_published["homepage"], 1)
        backlog_homepage_id = backlog_publish.get("homepage_snapshot_id")
        if backlog_homepage_id:
            homepage_snapshot_id = backlog_homepage_id
            if backlog_homepage_id != writer_summary.get("homepage_snapshot_id"):
                await _annotate_homepage_snapshot(backlog_homepage_id)

    await update_voice_memory(
        db,
        memory_type="persona",
        key="queen_voice",
        value="The Queen is sharp, Texan, Hayek-literate, and glam without losing factual discipline.",
        weight=1.35,
    )
    await update_voice_memory(
        db,
        memory_type="pipeline",
        key="queen_last_cycle",
        value=f"Completed at {datetime.utcnow().isoformat()} UTC | direct_publish={direct_publish}",
        weight=1.0,
    )

    publish_package = {
        "lead_story": _story_card(lead_story),
        "homepage_snapshot_id": homepage_snapshot_id,
        "homepage_angle": writer_summary.get("homepage_angle"),
        "social_rollout": {
            "count": social_count,
            "auto_published": auto_published["social"],
            "dispatch_ready": bool(social_count),
        },
        "backlog": {
            "reworked": int(backlog_rework.get("reworked_editorial_count") or 0),
            "published": int(backlog_publish.get("published_editorial_count") or 0),
        },
        "signal_links": curated_links[:3],
    }

    return {
        "role": "queen",
        "plugins": _role_plugins("queen"),
        "direct_publish": direct_publish,
        "auto_publish_editorials": auto_publish_editorials,
        "backlog": {
            "rework": backlog_rework,
            "publish": backlog_publish,
        },
        "curated_links": curated_links,
        "generated_social_posts": social_count,
        "social_dispatch_concurrency": int(settings.social_dispatch_concurrency),
        "social_error": social_error,
        "homepage_error": homepage_error,
        "auto_published": auto_published,
        "publish_package": publish_package,
    }


async def run_pipeline_cycle(db: AsyncSession, *, actor: str = "worker") -> dict:
    cycle_id = uuid.uuid4()
    cycle_started_at = datetime.utcnow()
    lock_acquired, lock_client, lock_token = await _acquire_pipeline_lock(cycle_id, actor)
    if not lock_acquired:
        completed_at = datetime.utcnow()
        await _log_pipeline_event(
            db,
            cycle_id=cycle_id,
            action="cycle_skipped",
            actor=actor,
            snapshot={
                "cycle_id": str(cycle_id),
                "started_at": cycle_started_at,
                "completed_at": completed_at,
                "reason": "pipeline_already_running",
                "lock_ttl_seconds": int(settings.pipeline_lock_ttl_seconds),
            },
        )
        return {
            "cycle_id": str(cycle_id),
            "status": "skipped",
            "reason": "pipeline_already_running",
            "started_at": cycle_started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_seconds": round((completed_at - cycle_started_at).total_seconds(), 2),
            "roles": [role["role"] for role in CAT_ROLE_PIPELINE],
        }

    stage_results: dict[str, dict] = {}
    stage_functions = {
        "researcher": run_researcher_cycle,
        "analyst": run_analyst_cycle,
        "writer": run_writer_cycle,
        "queen": run_queen_cycle,
    }

    try:
        await _log_pipeline_event(
            db,
            cycle_id=cycle_id,
            action="cycle_started",
            actor=actor,
            snapshot={"cycle_id": str(cycle_id), "started_at": cycle_started_at},
        )

        for role in CAT_ROLE_PIPELINE:
            stage = role["role"]
            stage_started_at = datetime.utcnow()
            await _log_pipeline_event(
                db,
                cycle_id=cycle_id,
                action="stage_started",
                actor=stage,
                snapshot={"stage": stage, "started_at": stage_started_at, "plugins": role["plugins"]},
            )
            try:
                if stage == "writer":
                    researcher = stage_results.get("researcher", {})
                    analyst = stage_results.get("analyst", {})
                    should_run_writer, skip_reason = _writer_should_run(researcher, analyst)
                    if not should_run_writer:
                        result = {
                            "role": "writer",
                            "skipped": True,
                            "reason": skip_reason,
                            "writer_material": researcher.get("writer_material") or {},
                        }
                        stage_results[stage] = result
                        await _log_pipeline_event(
                            db,
                            cycle_id=cycle_id,
                            action="stage_skipped",
                            actor=stage,
                            snapshot={"stage": stage, "reason": result["reason"]},
                        )
                        continue

                if stage == "queen":
                    result = await stage_functions[stage](db, writer_summary=stage_results.get("writer", {}))
                else:
                    result = await stage_functions[stage](db)
                result["duration_seconds"] = round((datetime.utcnow() - stage_started_at).total_seconds(), 2)
                stage_results[stage] = result
                await _log_pipeline_event(
                    db,
                    cycle_id=cycle_id,
                    action="stage_completed",
                    actor=stage,
                    snapshot={
                        "stage": stage,
                        "started_at": stage_started_at,
                        "completed_at": datetime.utcnow(),
                        "result": result,
                    },
                )
            except Exception as exc:
                log_event(
                    logger,
                    "pipeline.stage_failed",
                    level=40,
                    cycle_id=str(cycle_id),
                    stage=stage,
                    error=str(exc),
                )
                await _log_pipeline_event(
                    db,
                    cycle_id=cycle_id,
                    action="stage_failed",
                    actor=stage,
                    snapshot={
                        "stage": stage,
                        "started_at": stage_started_at,
                        "failed_at": datetime.utcnow(),
                        "error": str(exc),
                    },
                )
                await _log_pipeline_event(
                    db,
                    cycle_id=cycle_id,
                    action="cycle_failed",
                    actor=actor,
                    snapshot={"failed_stage": stage, "error": str(exc), "started_at": cycle_started_at},
                )
                raise

        cycle_completed_at = datetime.utcnow()
        await _log_pipeline_event(
            db,
            cycle_id=cycle_id,
            action="cycle_completed",
            actor=actor,
            snapshot={
                "cycle_id": str(cycle_id),
                "started_at": cycle_started_at,
                "completed_at": cycle_completed_at,
                "stage_results": stage_results,
            },
        )
        summary = {
            "cycle_id": str(cycle_id),
            "started_at": cycle_started_at.isoformat(),
            "completed_at": cycle_completed_at.isoformat(),
            "duration_seconds": round((cycle_completed_at - cycle_started_at).total_seconds(), 2),
            "roles": [role["role"] for role in CAT_ROLE_PIPELINE],
            "stage_results": stage_results,
        }
        summary.update(stage_results)
        log_event(logger, "pipeline.cycle_completed", **summary)
        return summary
    finally:
        await _release_pipeline_lock(lock_client, lock_token)
