from collections import defaultdict
from datetime import datetime
import re

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import EditorialObject, HomepageSnapshot, RevisionHistory, SocialPost, Source, SourceEmbedding, Theme
from schemas import SystemSettingsUpdateIn
from services.analysis_engine import build_analysis_dashboard, count_analysis_briefs, get_analysis_overview
from services.editorial_service import get_runtime_controls, update_runtime_controls
from services.publishing_service import publish_ready_backlog
from services.source_policy import source_current_news_assessment
from services.pipeline_blueprint import get_role_pipeline
from workers.jobs import run_pipeline_cycle

router = APIRouter(prefix="/admin", tags=["admin"])


def _word_count(text: str | None) -> int:
    return len(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _serialize_revision(row: RevisionHistory) -> dict:
    return {
        "id": str(row.id),
        "object_table": row.object_table,
        "object_id": str(row.object_id),
        "action": row.action,
        "actor": row.actor,
        "snapshot": row.snapshot,
        "created_at": row.created_at.isoformat() if isinstance(row.created_at, datetime) else row.created_at,
    }


def _pipeline_event_age_seconds(value: object) -> float | None:
    if not isinstance(value, datetime):
        return None
    event_at = value.replace(tzinfo=None) if value.tzinfo else value
    return (datetime.utcnow() - event_at).total_seconds()


def _finalize_pipeline_cycle_status(cycle: dict) -> dict:
    if cycle.get("status") == "running":
        age_seconds = _pipeline_event_age_seconds(cycle.get("last_event_at"))
        if age_seconds is not None and age_seconds > int(settings.pipeline_stale_after_seconds):
            cycle["status"] = "interrupted"
            cycle["interrupted"] = True
            cycle["stale_after_seconds"] = int(settings.pipeline_stale_after_seconds)
    return cycle


def _serialize_editorial_card(row: EditorialObject) -> dict:
    metadata = row.meta or {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
    analysis_brief = metadata.get("analysis_brief", {}) if isinstance(metadata, dict) else {}
    analysis_meta = analysis_brief.get("meta", {}) if isinstance(analysis_brief, dict) else {}
    analysis_tone = analysis_meta.get("tone", {}) if isinstance(analysis_meta, dict) else {}
    return {
        "id": str(row.id),
        "title": row.title,
        "slug": row.slug,
        "status": row.status,
        "object_type": row.object_type,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "story_form": metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else None),
        "story_mode": metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else None),
        "theme_slug": metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else None),
        "word_count": int(metadata.get("word_count") or _word_count(row.body_md)),
        "selected_angle": launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else None,
        "why_now": launch_packet.get("why_now") if isinstance(launch_packet, dict) else None,
        "pattern_signals": launch_packet.get("pattern_signals", [])[:3] if isinstance(launch_packet, dict) else [],
        "social_hooks": launch_packet.get("social_hooks", [])[:3] if isinstance(launch_packet, dict) else [],
        "source_mix": metadata.get("source_mix") or (story_brief.get("source_mix") if isinstance(story_brief, dict) else None),
        "freshness_score": metadata.get("freshness_score") if isinstance(metadata, dict) else None,
        "publish_recommendation": metadata.get("publish_recommendation"),
        "analysis_tone": analysis_tone.get("primary") if isinstance(analysis_tone, dict) else None,
        "analysis_summary": analysis_brief.get("summary") if isinstance(analysis_brief, dict) else None,
    }


def _serialize_source_card(row: Source) -> dict:
    metadata = row.meta or {}
    current_news = source_current_news_assessment(row)
    return {
        "id": str(row.id),
        "title": row.title,
        "source_name": row.source_name,
        "source_url": row.source_url,
        "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "quality_score": float(metadata.get("quality_score") or 0),
        "credibility_tier": metadata.get("credibility_tier"),
        "published_year": current_news.get("published_year"),
        "current_news_eligible": bool(current_news.get("current_news_eligible")),
        "fundamental_view_candidate": bool(current_news.get("fundamental_view_candidate")),
        "embedding_status": metadata.get("embedding_status"),
        "embedding_chunk_count": int(metadata.get("embedding_chunk_count") or 0),
        "embedded_chunk_count": int(metadata.get("embedded_chunk_count") or 0),
        "vector_indexed": bool(metadata.get("vector_indexed")),
        "embedding_needs_refresh": bool(metadata.get("embedding_needs_refresh")),
    }


def _serialize_social_card(row: SocialPost) -> dict:
    metadata = row.meta or {}
    return {
        "id": str(row.id),
        "platform": row.platform,
        "status": row.status,
        "body": row.body,
        "variant": metadata.get("variant"),
        "hook_type": metadata.get("hook_type"),
        "slot": metadata.get("slot"),
        "style_score": metadata.get("style_score"),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
    }


@router.get("/summary")
async def admin_summary(db: AsyncSession = Depends(get_db)) -> dict:
    total_sources = int((await db.scalar(select(func.count()).select_from(Source))) or 0)
    source_embeddings = int((await db.scalar(select(func.count()).select_from(SourceEmbedding))) or 0)
    embedded_sources = int(
        (await db.scalar(select(func.count(func.distinct(SourceEmbedding.source_id))).select_from(SourceEmbedding))) or 0
    )
    embedding_coverage_pct = round((embedded_sources / total_sources) * 100, 1) if total_sources else 0.0
    return {
        "sources": total_sources,
        "source_embeddings": source_embeddings,
        "embedded_sources": embedded_sources,
        "embedding_coverage_pct": embedding_coverage_pct,
        "themes": int((await db.scalar(select(func.count()).select_from(Theme))) or 0),
        "analysis_briefs": await count_analysis_briefs(db),
        "editorial_drafts": int(
            (await db.scalar(select(func.count()).select_from(EditorialObject).where(EditorialObject.status == "draft"))) or 0
        ),
        "homepage_drafts": int(
            (await db.scalar(select(func.count()).select_from(HomepageSnapshot).where(HomepageSnapshot.status == "draft"))) or 0
        ),
        "social_drafts": int(
            (await db.scalar(select(func.count()).select_from(SocialPost).where(SocialPost.status == "draft"))) or 0
        ),
        "pipeline_cycles": int(
            (
                await db.scalar(
                    select(func.count())
                    .select_from(RevisionHistory)
                    .where(
                        and_(
                            RevisionHistory.object_table == "pipeline_cycle",
                            RevisionHistory.action.in_(["cycle_completed", "cycle_failed", "phase_completed", "phase_failed"]),
                        )
                    )
                )
            )
            or 0
        ),
    }


@router.get("/pipeline")
async def admin_pipeline(limit: int = 80, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            select(RevisionHistory)
            .where(RevisionHistory.object_table == "pipeline_cycle")
            .order_by(RevisionHistory.created_at.desc())
            .limit(max(20, min(limit, 200)))
        )
    ).scalars().all()
    rows = list(reversed(rows))

    cycle_events: dict[str, dict] = defaultdict(
        lambda: {"cycle_id": "", "status": "running", "started_at": None, "completed_at": None, "stages": []}
    )

    for row in rows:
        cycle_id = str(row.object_id)
        snapshot = row.snapshot or {}
        cycle = cycle_events[cycle_id]
        cycle["cycle_id"] = cycle_id
        cycle["last_event_at"] = row.created_at

        if row.action in ("cycle_started", "phase_started"):
            cycle["started_at"] = snapshot.get("started_at") or row.created_at
            if row.action == "phase_started":
                cycle["phase"] = snapshot.get("phase") or row.actor
        elif row.action in ("cycle_completed", "phase_completed"):
            cycle["status"] = "completed"
            cycle["completed_at"] = snapshot.get("completed_at") or row.created_at
            cycle["result"] = snapshot.get("stage_results", {})
            if row.action == "phase_completed":
                cycle["phase"] = snapshot.get("phase") or row.actor
                cycle["stages"].extend(
                    {
                        "stage": stage_name,
                        "event": "stage_completed",
                        "at": row.created_at,
                        "plugins": [],
                        "result": result,
                        "error": None,
                    }
                    for stage_name, result in (snapshot.get("stage_results") or {}).items()
                )
        elif row.action in ("cycle_failed", "phase_failed"):
            cycle["status"] = "failed"
            cycle["completed_at"] = snapshot.get("failed_at") or row.created_at
            cycle["error"] = snapshot.get("error")
        elif row.action == "cycle_skipped":
            cycle["status"] = "skipped"
            cycle["started_at"] = snapshot.get("started_at") or cycle.get("started_at") or row.created_at
            cycle["completed_at"] = snapshot.get("completed_at") or row.created_at
            cycle["reason"] = snapshot.get("reason")
        elif row.action in ("stage_started", "stage_completed", "stage_failed", "stage_skipped"):
            cycle["stages"].append(
                {
                    "stage": snapshot.get("stage") or row.actor,
                    "event": row.action,
                    "at": row.created_at,
                    "plugins": snapshot.get("plugins", []),
                    "result": snapshot.get("result"),
                    "error": snapshot.get("error"),
                }
            )

    for cycle in cycle_events.values():
        _finalize_pipeline_cycle_status(cycle)

    cycle_list = sorted(cycle_events.values(), key=lambda item: item.get("last_event_at"), reverse=True)
    latest_cycle = cycle_list[0] if cycle_list else None

    return {
        "cycle_interval_minutes": int(settings.worker_cycle_minutes),
        "roles": get_role_pipeline(),
        "latest_cycle": latest_cycle,
        "recent_cycles": cycle_list[:5],
    }


@router.post("/pipeline/run-now")
async def run_pipeline_now(db: AsyncSession = Depends(get_db)) -> dict:
    return await run_pipeline_cycle(db, actor="admin")


@router.get("/analysis")
async def admin_analysis(db: AsyncSession = Depends(get_db)) -> dict:
    return await build_analysis_dashboard(db, story_limit=4, memory_limit=8)


@router.post("/publish-ready")
async def publish_ready(
    limit: int = 12,
    publish_social: bool = True,
    rework_drafts: bool = True,
    refresh_homepage: bool = True,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await publish_ready_backlog(
        db,
        limit=limit,
        publish_social=publish_social,
        rework_drafts=rework_drafts,
        refresh_homepage=refresh_homepage,
    )
    await db.commit()
    return result


@router.get("/system-settings")
async def admin_system_settings(db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    return {
        "controls": controls,
        "defaults": {
            "direct_publish_default": settings.direct_publish_default,
            "x_live_posting_default": settings.x_enabled and not settings.x_dry_run,
            "x_research_enabled_default": settings.x_research_enabled,
        },
        "environment": {
            "x_enabled": settings.x_enabled,
            "x_dry_run": settings.x_dry_run,
            "manual_review": settings.enable_manual_review,
            "auto_publish": settings.auto_publish,
            "auto_publish_social": settings.auto_publish_social,
        },
    }


@router.post("/system-settings")
async def update_admin_system_settings(payload: SystemSettingsUpdateIn, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await update_runtime_controls(
        db,
        direct_publish=payload.direct_publish,
        x_live_posting=payload.x_live_posting,
        x_research_enabled=payload.x_research_enabled,
        research_directive=payload.research_directive,
        analysis_directive=payload.analysis_directive,
        voice_blueprint=payload.voice_blueprint,
        live_vibe=payload.live_vibe,
    )
    return {"ok": True, "controls": controls}


@router.get("/jobs/recent")
async def recent_jobs(limit: int = 30, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            select(RevisionHistory)
            .where(RevisionHistory.object_table == "pipeline_cycle")
            .order_by(RevisionHistory.created_at.desc())
            .limit(max(5, min(limit, 100)))
        )
    ).scalars().all()
    return {"count": len(rows), "jobs": [_serialize_revision(row) for row in rows]}


@router.get("/jobs/failed")
async def failed_jobs(limit: int = 30, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(
            select(RevisionHistory)
            .where(
                RevisionHistory.object_table == "pipeline_cycle",
                RevisionHistory.action.in_(["stage_failed", "cycle_failed"]),
            )
            .order_by(RevisionHistory.created_at.desc())
            .limit(max(5, min(limit, 100)))
        )
    ).scalars().all()
    return {"count": len(rows), "jobs": [_serialize_revision(row) for row in rows]}


@router.get("/quality")
async def quality_report(db: AsyncSession = Depends(get_db)) -> dict:
    recent_sources = (
        await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(400))
    ).scalars().all()
    recent_editorial = (
        await db.execute(select(EditorialObject).order_by(EditorialObject.created_at.desc()).limit(30))
    ).scalars().all()
    analysis_overview = await get_analysis_overview(db)
    buckets = {"high": 0, "medium": 0, "low": 0}
    by_tier: dict[str, int] = defaultdict(int)
    refresh_due_sources = 0
    for source in recent_sources:
        metadata = source.meta or {}
        score = float(metadata.get("quality_score") or 0)
        tier = str(metadata.get("credibility_tier") or "unknown")
        by_tier[tier] += 1
        if bool(metadata.get("embedding_needs_refresh")):
            refresh_due_sources += 1
        if score >= 4.5:
            buckets["high"] += 1
        elif score >= 3.0:
            buckets["medium"] += 1
        else:
            buckets["low"] += 1

    ingest_runs = (
        await db.execute(
            select(RevisionHistory)
            .where(RevisionHistory.object_table == "ingestion_run")
            .order_by(RevisionHistory.created_at.desc())
            .limit(30)
        )
    ).scalars().all()

    total_sources = int((await db.scalar(select(func.count()).select_from(Source))) or 0)
    embedding_chunks = int((await db.scalar(select(func.count()).select_from(SourceEmbedding))) or 0)
    embedded_sources = int(
        (await db.scalar(select(func.count(func.distinct(SourceEmbedding.source_id))).select_from(SourceEmbedding))) or 0
    )

    story_forms: dict[str, int] = defaultdict(int)
    story_modes: dict[str, int] = defaultdict(int)
    repeated_lanes: dict[str, int] = defaultdict(int)
    word_counts: list[int] = []
    for row in recent_editorial:
        metadata = row.meta or {}
        story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
        story_form = str(
            metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else "") or "unknown"
        )
        story_mode = str(
            metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else "") or "unknown"
        )
        theme_slug = str(
            metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else "") or ""
        )
        story_forms[story_form] += 1
        story_modes[story_mode] += 1
        if theme_slug:
            repeated_lanes[theme_slug] += 1
        word_count = int(metadata.get("word_count") or _word_count(row.body_md))
        if word_count:
            word_counts.append(word_count)

    return {
        "source_sample_size": len(recent_sources),
        "quality_buckets": buckets,
        "credibility_tiers": by_tier,
        "embedding_state": {
            "total_sources": total_sources,
            "embedded_sources": embedded_sources,
            "embedding_chunks": embedding_chunks,
            "coverage_pct": round((embedded_sources / total_sources) * 100, 1) if total_sources else 0.0,
            "unembedded_sources": max(total_sources - embedded_sources, 0),
            "recent_refresh_due_sources": refresh_due_sources,
        },
        "writing_state": {
            "recent_story_sample_size": len(recent_editorial),
            "story_forms": dict(story_forms),
            "story_modes": dict(story_modes),
            "average_word_count": round(sum(word_counts) / len(word_counts), 1) if word_counts else 0.0,
            "repeated_lanes": {
                slug: count
                for slug, count in sorted(repeated_lanes.items(), key=lambda item: item[1], reverse=True)
                if count >= 2
            },
        },
        "analysis_state": {
            "brief_count": int((analysis_overview.get("stats") or {}).get("brief_count") or 0),
            "tone_distribution": (analysis_overview.get("stats") or {}).get("tone_distribution") or {},
            "topic_distribution": (analysis_overview.get("stats") or {}).get("topic_distribution") or {},
            "role_distribution": (analysis_overview.get("stats") or {}).get("role_distribution") or {},
            "site_brief_label": ((analysis_overview.get("site_brief") or {}).get("label")),
            "site_brief_title": ((analysis_overview.get("site_brief") or {}).get("title")),
        },
        "recent_ingestion_runs": [_serialize_revision(row) for row in ingest_runs[:10]],
    }


@router.get("/mission-control")
async def mission_control(db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    summary = await admin_summary(db)
    pipeline = await admin_pipeline(db=db)
    quality = await quality_report(db)
    analysis = await build_analysis_dashboard(db, story_limit=4, memory_limit=8)

    latest_editorial = (
        await db.execute(select(EditorialObject).order_by(EditorialObject.created_at.desc()).limit(6))
    ).scalars().all()
    latest_homepage = (
        await db.execute(select(HomepageSnapshot).order_by(HomepageSnapshot.created_at.desc()).limit(1))
    ).scalars().first()
    recent_social = (
        await db.execute(select(SocialPost).order_by(SocialPost.created_at.desc()).limit(8))
    ).scalars().all()
    top_themes = (
        await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(6))
    ).scalars().all()
    recent_sources = (
        await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(10))
    ).scalars().all()

    strong_links = sorted(
        recent_sources,
        key=lambda row: (float((row.meta or {}).get("quality_score") or 0), row.fetched_at.isoformat() if row.fetched_at else ""),
        reverse=True,
    )
    strong_links = [
        row
        for row in strong_links
        if float((row.meta or {}).get("quality_score") or 0) >= 4.2
        and bool(source_current_news_assessment(row).get("current_news_eligible"))
    ][:4]

    grounded_ready = any(
        bool(((row.meta or {}).get("publish_recommendation") or {}).get("recommended"))
        for row in latest_editorial[:3]
    )
    latest_source_at = recent_sources[0].fetched_at.isoformat() if recent_sources and recent_sources[0].fetched_at else None
    latest_cycle = pipeline.get("latest_cycle")
    latest_cycle_completed_at = latest_cycle.get("completed_at") if isinstance(latest_cycle, dict) else None

    readiness_flags: list[str] = []
    if grounded_ready:
        readiness_flags.append("grounded_editorial_ready")
    if strong_links:
        readiness_flags.append("signal_links_available")
    if controls.get("direct_publish"):
        readiness_flags.append("direct_publish_live")
    if controls.get("x_live_posting"):
        readiness_flags.append("social_dispatch_live")
    if latest_cycle_completed_at:
        readiness_flags.append("recent_pipeline_cycle")
    if int((analysis.get("stats") or {}).get("brief_count") or 0) > 0:
        readiness_flags.append("analysis_briefs_live")

    return {
        "controls": controls,
        "summary": summary,
        "quality": quality,
        "analysis": {
            "analysis_headline": ((analysis.get("latest_analyst") or {}).get("analysis_headline")),
            "pattern_read": ((analysis.get("latest_analyst") or {}).get("pattern_read")),
            "tone_lane": ((analysis.get("latest_analyst") or {}).get("tone_lane")),
            "topic_tone_map": ((analysis.get("latest_analyst") or {}).get("topic_tone_map") or [])[:3],
        },
        "index_state": quality.get("embedding_state"),
        "writing_state": quality.get("writing_state"),
        "pipeline": pipeline,
        "publish_readiness": {
            "ready": grounded_ready,
            "flags": readiness_flags,
            "manual_review": settings.enable_manual_review,
            "latest_cycle_completed_at": latest_cycle_completed_at,
            "latest_source_at": latest_source_at,
        },
        "latest_editorial": [_serialize_editorial_card(row) for row in latest_editorial],
        "latest_homepage": {
            "id": str(latest_homepage.id),
            "status": latest_homepage.status,
            "rationale": latest_homepage.rationale,
            "created_at": latest_homepage.created_at.isoformat() if latest_homepage.created_at else None,
            "published_at": latest_homepage.published_at.isoformat() if latest_homepage.published_at else None,
            "layout": latest_homepage.layout_json,
        }
        if latest_homepage
        else None,
        "recent_social": [_serialize_social_card(row) for row in recent_social],
        "top_themes": [
            {
                "slug": row.slug,
                "name": row.name,
                "description": row.description,
                "active_score": float(row.active_score or 0),
            }
            for row in top_themes
        ],
        "recent_sources": [_serialize_source_card(row) for row in recent_sources],
        "strong_links": [_serialize_source_card(row) for row in strong_links],
    }
