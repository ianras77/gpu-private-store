from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import EditorialObject, SocialPost, Source
from services.editorial_service import (
    derive_editorial_title,
    evaluate_style_gate,
    generate_homepage_snapshot,
    get_runtime_controls,
    record_voice_learning_from_publication,
    rework_editorial_backlog,
)
from services.revision_service import record_revision
from services.social_dispatcher import dispatch_social_post
from services.source_policy import contains_prompt_leak, editorial_looks_placeholder, has_trump_focus, source_current_news_assessment


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _window_open() -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=int(settings.backlog_publish_window_hours))


def _draft_is_recent(row: EditorialObject | SocialPost) -> bool:
    created_at = _utc(getattr(row, "created_at", None))
    if not created_at:
        return False
    return created_at >= _window_open()


async def _current_news_source_count(db: AsyncSession, editorial: EditorialObject) -> int:
    source_ids = []
    for raw_id in editorial.primary_source_ids or []:
        try:
            source_ids.append(uuid.UUID(str(raw_id)))
        except (TypeError, ValueError):
            continue
    if not source_ids:
        return 0
    sources = (await db.execute(select(Source).where(Source.id.in_(source_ids)))).scalars().all()
    return sum(1 for source in sources if source_current_news_assessment(source).get("current_news_eligible"))


async def _editorial_publishable_now(db: AsyncSession, editorial: EditorialObject) -> tuple[bool, dict[str, Any]]:
    metadata = editorial.meta or {}
    publish_recommendation = metadata.get("publish_recommendation", {}) if isinstance(metadata, dict) else {}
    style_gate = metadata.get("style_gate") or evaluate_style_gate(editorial.body_md or "", lane="editorial")
    title = derive_editorial_title(editorial.title, editorial.body_md, editorial.object_type)
    freshness_age_days = ((metadata.get("source_mix") or {}) if isinstance(metadata, dict) else {}).get("freshest_age_days")
    current_news_source_count = await _current_news_source_count(db, editorial)

    publishable = bool(
        editorial.status in {"draft", "approved"}
        and _draft_is_recent(editorial)
        and not editorial_looks_placeholder(title, editorial.body_md)
        and not contains_prompt_leak(title, editorial.body_md)
        and has_trump_focus(title, editorial.body_md, str(metadata.get("selected_angle") or ""), str(metadata.get("why_now") or ""))
        and bool(publish_recommendation.get("recommended"))
        and bool(style_gate.get("passes"))
        and freshness_age_days is not None
        and int(freshness_age_days) <= int(settings.current_news_max_age_days)
        and current_news_source_count >= max(1, int(settings.generation_min_grounded_sources))
    )

    return publishable, {
        "title": title,
        "style_gate": style_gate,
        "freshness_age_days": freshness_age_days,
        "current_news_source_count": current_news_source_count,
        "publish_recommendation": publish_recommendation,
    }


def _social_publishable_now(post: SocialPost) -> bool:
    metadata = post.meta or {}
    style_gate = metadata.get("style_gate") or evaluate_style_gate(post.body or "", lane="social")
    if post.status not in {"draft", "approved"}:
        return False
    if not _draft_is_recent(post):
        return False
    if contains_prompt_leak(post.body):
        return False
    if (post.body or "").lstrip().startswith("# "):
        return False
    return bool(style_gate.get("passes"))


async def publish_ready_backlog(
    db: AsyncSession,
    *,
    limit: int = 12,
    publish_social: bool = True,
    rework_drafts: bool = True,
    refresh_homepage: bool = True,
) -> dict[str, Any]:
    controls = await get_runtime_controls(db)
    rework_summary: dict[str, Any] = {
        "ok": True,
        "candidate_count": 0,
        "reworked_editorial_count": 0,
        "reworked_editorials": [],
        "publish_ready_editorial_ids": [],
        "failure_count": 0,
        "failures": [],
        "skipped": [],
    }
    if rework_drafts:
        rework_summary = await rework_editorial_backlog(db, limit=max(1, limit))

    rows = (
        await db.execute(
            select(EditorialObject)
            .where(EditorialObject.status.in_(["draft", "approved"]))
            .order_by(EditorialObject.created_at.desc())
            .limit(max(limit * 8, 48))
        )
    ).scalars().all()

    editorial_candidates: list[tuple[EditorialObject, dict[str, Any]]] = []
    for row in rows:
        publishable, diagnostics = await _editorial_publishable_now(db, row)
        if publishable:
            editorial_candidates.append((row, diagnostics))
        if len(editorial_candidates) >= limit:
            break

    published_editorials: list[EditorialObject] = []
    for row, diagnostics in editorial_candidates[:limit]:
        row.status = "published"
        row.published_at = datetime.utcnow()
        row.updated_at = datetime.utcnow()
        row.meta = {
            **(row.meta or {}),
            "published_from_backlog": True,
            "published_from_backlog_at": datetime.utcnow().isoformat(),
            "publish_recommendation": {
                **((row.meta or {}).get("publish_recommendation") or {}),
                "backlog_publish": True,
            },
        }
        await record_revision(
            db,
            object_table="editorial_objects",
            object_id=row.id,
            action="published_backlog",
            snapshot={
                "status": row.status,
                "title": diagnostics.get("title"),
                "freshness_age_days": diagnostics.get("freshness_age_days"),
                "current_news_source_count": diagnostics.get("current_news_source_count"),
            },
        )
        metadata = row.meta or {}
        await record_voice_learning_from_publication(
            db,
            lane="editorial",
            title=row.title,
            body=row.body_md,
            story_brief=metadata.get("story_brief") if isinstance(metadata, dict) else None,
            launch_packet=metadata.get("launch_packet") if isinstance(metadata, dict) else None,
        )
        published_editorials.append(row)

    published_social: list[SocialPost] = []
    if publish_social and published_editorials:
        editorial_ids = [row.id for row in published_editorials]
        social_rows = (
            await db.execute(
                select(SocialPost)
                .where(SocialPost.editorial_object_id.in_(editorial_ids), SocialPost.status.in_(["draft", "approved"]))
                .order_by(SocialPost.created_at.desc())
                .limit(max(limit * 10, 40))
            )
        ).scalars().all()
        seen_keys: set[tuple[str, str, str]] = set()
        for post in social_rows:
            if not _social_publishable_now(post):
                continue
            metadata = post.meta or {}
            key = (
                str(post.editorial_object_id or ""),
                str(metadata.get("variant") or ""),
                (post.body or "").strip().lower(),
            )
            if key in seen_keys:
                continue
            seen_keys.add(key)
            publish_response = await dispatch_social_post(post, force_dry_run=not controls["x_live_posting"])
            post.status = "published"
            post.published_at = datetime.utcnow()
            post.meta = {
                **metadata,
                "publish_response": publish_response,
                "published_from_backlog": True,
            }
            await record_revision(
                db,
                object_table="social_posts",
                object_id=post.id,
                action="published_backlog",
                snapshot={"status": post.status, "response": publish_response},
            )
            await record_voice_learning_from_publication(
                db,
                lane="social",
                title=str(metadata.get("variant") or "x-post"),
                body=post.body,
            )
            published_social.append(post)

    homepage_snapshot = None
    if refresh_homepage and published_editorials:
        homepage_snapshot = await generate_homepage_snapshot(db, publish_now=True)

    return {
        "ok": True,
        "controls": controls,
        "rework": rework_summary,
        "reworked_editorial_count": int(rework_summary.get("reworked_editorial_count") or 0),
        "reworked_editorial_ids": [
            str(item.get("editorial_id") or "")
            for item in (rework_summary.get("reworked_editorials") or [])
            if str(item.get("editorial_id") or "")
        ],
        "published_editorial_count": len(published_editorials),
        "published_editorial_ids": [str(row.id) for row in published_editorials],
        "published_social_count": len(published_social),
        "published_social_ids": [str(row.id) for row in published_social],
        "homepage_snapshot_id": str(homepage_snapshot.id) if homepage_snapshot else None,
        "homepage_status": homepage_snapshot.status if homepage_snapshot else None,
        "refresh_homepage": refresh_homepage,
        "x_live_posting": bool(controls.get("x_live_posting")),
        "social_dispatch_mode": "live" if controls.get("x_live_posting") else "dry-run",
    }
