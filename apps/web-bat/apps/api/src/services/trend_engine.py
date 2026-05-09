from __future__ import annotations

from datetime import date, datetime
import re
from typing import Iterable

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Source, Theme, ThemeMember, TrendObservation
from services.source_policy import has_bat_focus
from services.structured_logging import get_logger, log_event
from utils import slugify_loose

logger = get_logger("bat.trend_engine")

TREND_BUCKETS: dict[str, list[str]] = {
    "executive-overreach": ["executive", "order", "power", "authority"],
    "loyalty-theater": ["loyalty", "loyalist", "pledge", "fealty", "endorsement", "purge"],
    "legal-collision": ["court", "judge", "lawsuit", "ruling", "legal"],
    "culture-war-cosmetics": ["culture", "school", "woke", "gender", "book"],
    "elite-image-management": ["image", "brand", "branding", "messaging", "rebrand", "optics"],
    "conservative-discomfort": ["republican", "gop", "conservative", "uneasy", "backlash", "split", "adrift"],
    "propaganda-repetition": ["repeat", "narrative", "talking point", "echo"],
    "policy-chaos-hidden-behind-style": ["chaos", "confusion", "reversal", "walked back", "contradiction"],
    "institutional-humiliation": ["agency", "staff", "resign", "fired"],
    "family-dynastic-branding": [
        "family",
        "dynastic",
        "brand",
        "branding",
        "licensing",
        "license",
        "business",
        "deal",
        "trump organization",
        "hotel",
        "golf",
        "crypto",
        "ivanka",
        "eric",
        "donald trump jr",
        "don jr",
        "jared kushner",
        "heir",
    ],
    "foreign-policy-escalation": ["iran", "israel", "escalation", "retaliation", "ceasefire", "middle east"],
    "military-brinkmanship": ["strike", "airstrike", "missile", "troops", "military", "pentagon"],
    "allied-anxiety": ["ally", "allies", "nato", "gulf", "partner", "partners", "mistrust", "strain", "diplomacy"],
    "energy-shock-politics": ["oil", "gas prices", "inflation", "hormuz", "market", "shipping"],
    "war-room-narrative-spin": ["briefing", "messaging", "walked back", "clarified", "talking point", "spin"],
}
TREND_BUCKET_MIN_HITS: dict[str, int] = {
    "family-dynastic-branding": 2,
    "conservative-discomfort": 2,
    "allied-anxiety": 2,
}
TREND_BUCKET_REQUIRED_GROUPS: dict[str, list[list[str]]] = {
    "family-dynastic-branding": [
        ["family", "trump family", "dynastic", "ivanka", "eric", "donald trump jr", "don jr", "jared kushner", "heir"],
        ["brand", "branding", "licensing", "license", "business", "deal", "trump organization", "hotel", "golf", "crypto", "ethics"],
    ],
    "conservative-discomfort": [
        ["republican", "gop", "conservative"],
        ["uneasy", "backlash", "split", "adrift", "discomfort", "rebuke", "resistance"],
    ],
    "allied-anxiety": [
        ["ally", "allies", "nato", "gulf", "partner", "partners", "europe", "european"],
        ["mistrust", "strain", "anxiety", "alarm", "scramble", "pressure", "diplomacy", "ceasefire"],
    ],
}


def _normalized_haystack(*parts: object) -> str:
    return re.sub(r"\s+", " ", " ".join(str(part or "") for part in parts).lower()).strip()


def _contains_theme_term(haystack: str, term: str) -> bool:
    normalized_haystack = _normalized_haystack(haystack)
    normalized_term = _normalized_haystack(term)
    if not normalized_haystack or not normalized_term:
        return False
    if " " in normalized_term:
        return f" {normalized_term} " in f" {normalized_haystack} "
    return bool(re.search(rf"\b{re.escape(normalized_term)}\b", normalized_haystack))


def _theme_hit_count(haystack: str, keywords: list[str]) -> int:
    return sum(1 for keyword in keywords if _contains_theme_term(haystack, keyword))


def _matches_required_groups(haystack: str, groups: list[list[str]]) -> bool:
    if not groups:
        return True
    return all(any(_contains_theme_term(haystack, term) for term in group) for group in groups)


def _source_quality(source: Source) -> float:
    return float((source.meta or {}).get("quality_score") or 0)


def _change_type(active_score: float) -> str:
    if active_score >= 5:
        return "rising"
    if active_score >= 2:
        return "steady"
    return "cooling"


def _dedupe_matches(matched: Iterable[tuple[Source, float]]) -> list[tuple[Source, float]]:
    by_source_id: dict = {}
    for source, score in matched:
        source_id = source.id
        existing = by_source_id.get(source_id)
        if existing is None or float(score) > float(existing[1]):
            by_source_id[source_id] = (source, float(score))
    return list(by_source_id.values())


async def _upsert_trend_observation(
    db: AsyncSession,
    *,
    theme_id,
    title: str,
    summary: str,
    change_type: str,
    confidence: float,
    source_count: int,
) -> None:
    observation_day = date.today()
    existing_rows = (
        await db.execute(
            select(TrendObservation).where(
                TrendObservation.theme_id == theme_id,
                TrendObservation.observation_date == observation_day,
            )
        )
    ).scalars().all()
    existing = existing_rows[0] if existing_rows else None
    for duplicate in existing_rows[1:]:
        await db.delete(duplicate)

    if existing:
        existing.title = title
        existing.summary = summary
        existing.change_type = change_type
        existing.confidence = confidence
        existing.meta = {
            **(existing.meta or {}),
            "source_count": source_count,
            "updated_at": datetime.utcnow().isoformat(),
        }
        return

    db.add(
        TrendObservation(
            theme_id=theme_id,
            observation_date=observation_day,
            title=title,
            summary=summary,
            change_type=change_type,
            confidence=confidence,
            meta={"source_count": source_count, "created_at": datetime.utcnow().isoformat()},
        )
    )


async def _cleanup_duplicate_observations(db: AsyncSession) -> int:
    result = await db.execute(
        text(
            """
            delete from trend_observations as target
            using (
              select id
              from (
                select
                  id,
                  row_number() over (
                    partition by theme_id, observation_date
                    order by id desc
                  ) as row_rank
                from trend_observations
              ) ranked
              where ranked.row_rank > 1
            ) as dupes
            where target.id = dupes.id
            """
        )
    )
    await db.commit()
    return int(result.rowcount or 0)


async def rebuild_themes(db: AsyncSession) -> dict:
    removed_duplicates = await _cleanup_duplicate_observations(db)
    sources = (await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(300))).scalars().all()
    if not sources:
        return {"themes": 0, "memberships": 0, "deduped_observations": removed_duplicates}

    sources = [source for source in sources if _source_quality(source) >= float(settings.ingestion_min_quality_score)]
    if not sources:
        log_event(logger, "trend.rebuild.skipped", reason="no_high_quality_sources")
        return {
            "themes": 0,
            "memberships": 0,
            "skipped": "no_high_quality_sources",
            "deduped_observations": removed_duplicates,
        }

    await db.execute(ThemeMember.__table__.delete())
    await db.commit()

    created_themes = 0
    memberships = 0

    for slug, keywords in TREND_BUCKETS.items():
        min_hits = int(TREND_BUCKET_MIN_HITS.get(slug, 1) or 1)
        required_groups = TREND_BUCKET_REQUIRED_GROUPS.get(slug, [])
        matched = []
        for source in sources:
            haystack = _normalized_haystack(
                source.title,
                (source.meta or {}).get("search_snippet"),
                source.raw_text,
            )
            if not has_bat_focus(
                source.title,
                str((source.meta or {}).get("search_snippet") or ""),
                str((source.meta or {}).get("query_original") or ""),
                source.raw_text,
            ):
                continue
            hits = _theme_hit_count(haystack, keywords)
            if hits < min_hits:
                continue
            if not _matches_required_groups(haystack, required_groups):
                continue
            quality_weight = max(1.0, _source_quality(source) / 3)
            specificity_bonus = 1.0 + (0.12 * max(0, hits - min_hits))
            matched.append((source, (float(hits) / max(len(keywords), 1)) * quality_weight * specificity_bonus))

        matched = _dedupe_matches(matched)
        if not matched:
            continue

        theme = (await db.execute(select(Theme).where(Theme.slug == slug))).scalar_one_or_none()
        if not theme:
            theme = Theme(
                slug=slug,
                name=slug.replace("-", " ").title(),
                description=f"Recurring pattern bucket: {slug}",
                first_seen_at=datetime.utcnow(),
            )
            db.add(theme)
            await db.commit()
            await db.refresh(theme)
            created_themes += 1

        theme.active_score = round(sum(score for _, score in matched), 2)
        theme.last_seen_at = datetime.utcnow()
        theme.meta = {
            **(theme.meta or {}),
            "membership_count": len(matched),
            "updated_at": datetime.utcnow().isoformat(),
        }
        await db.commit()

        membership_payload = [{"theme_id": theme.id, "source_id": source.id, "score": score} for source, score in matched]
        if membership_payload:
            stmt = insert(ThemeMember).values(membership_payload)
            stmt = stmt.on_conflict_do_update(
                index_elements=[ThemeMember.theme_id, ThemeMember.source_id],
                set_={"score": stmt.excluded.score},
            )
            await db.execute(stmt)
            memberships += len(membership_payload)

        top_source = matched[0][0]
        top_title = (top_source.title or "").strip() or f"{theme.name} remains active"
        await _upsert_trend_observation(
            db,
            theme_id=theme.id,
            title=top_title[:220],
            summary=(
                f"{theme.name} is active in {len(matched)} recent sources; "
                f"lead receipt: {top_source.title or 'Untitled source'}."
            ),
            change_type=_change_type(float(theme.active_score or 0)),
            confidence=min(1.0, float(theme.active_score or 0) / 8),
            source_count=len(matched),
        )

    await db.commit()

    trend_count = await db.scalar(select(func.count()).select_from(Theme))
    summary = {
        "themes": int(trend_count or 0),
        "memberships": memberships,
        "created_themes": created_themes,
        "deduped_observations": removed_duplicates,
    }
    log_event(logger, "trend.rebuild.completed", **summary)
    return summary


async def infer_theme_from_title(db: AsyncSession, title: str) -> Theme | None:
    slug = slugify_loose(title)
    existing = (await db.execute(select(Theme).where(Theme.slug == slug))).scalar_one_or_none()
    if existing:
        return existing
    return None
