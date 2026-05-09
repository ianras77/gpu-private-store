from datetime import datetime
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import EditorialObject
from schemas import EditorialGenerateRequest
from services.editorial_service import (
    derive_editorial_title,
    evaluate_style_gate,
    generate_editorial_object,
    generate_social_posts,
    get_runtime_controls,
    record_voice_learning_from_publication,
)
from services.revision_service import record_revision
from services.social_dispatcher import dispatch_social_post

router = APIRouter(prefix="/editorial", tags=["editorial"])


def _word_count(text: str | None) -> int:
    return len(re.findall(r"[a-z0-9']+", (text or "").lower()))


def _serialize_editorial(row: EditorialObject, *, include_body: bool = False) -> dict:
    title = derive_editorial_title(row.title, row.body_md, row.object_type)
    metadata = row.meta or {}
    story_brief = metadata.get("story_brief", {}) if isinstance(metadata, dict) else {}
    launch_packet = metadata.get("launch_packet", {}) if isinstance(metadata, dict) else {}
    payload = {
        "id": row.id,
        "object_type": row.object_type,
        "status": row.status,
        "title": title,
        "slug": row.slug,
        "dek": row.dek,
        "summary": row.summary,
        "story_form": metadata.get("story_form") or (story_brief.get("story_form") if isinstance(story_brief, dict) else None),
        "story_mode": metadata.get("story_mode") or (story_brief.get("story_mode") if isinstance(story_brief, dict) else None),
        "theme_slug": metadata.get("theme_slug") or (story_brief.get("theme_slug") if isinstance(story_brief, dict) else None),
        "word_count": int(metadata.get("word_count") or _word_count(row.body_md)),
        "selected_angle": launch_packet.get("selected_angle") if isinstance(launch_packet, dict) else None,
        "why_now": launch_packet.get("why_now") if isinstance(launch_packet, dict) else None,
        "social_hooks": launch_packet.get("social_hooks", [])[:3] if isinstance(launch_packet, dict) else [],
        "source_mix": metadata.get("source_mix") or (story_brief.get("source_mix") if isinstance(story_brief, dict) else None),
        "metadata": metadata,
        "created_at": row.created_at,
        "published_at": row.published_at,
    }
    if include_body:
        payload["body_md"] = row.body_md
    return payload


@router.post("/generate")
async def generate_editorial(payload: EditorialGenerateRequest, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    should_publish = bool(payload.publish_now or controls["direct_publish"])
    obj = await generate_editorial_object(
        db,
        object_type=payload.object_type,
        theme_slug=payload.theme_slug,
        publish_now=should_publish,
    )
    response: dict = {
        "id": obj.id,
        "object_type": obj.object_type,
        "status": obj.status,
        "title": obj.title,
        "slug": obj.slug,
    }
    if payload.immediate_social:
        posts = await generate_social_posts(db, obj, publish_now=should_publish)
        if should_publish:
            for post in posts:
                if post.status != "published":
                    continue
                publish_response = await dispatch_social_post(post, force_dry_run=not controls["x_live_posting"])
                post.meta = {**(post.meta or {}), "publish_response": publish_response}
            await db.commit()
        response["social_post_ids"] = [post.id for post in posts]
        response["social_generated"] = len(posts)
    return response


@router.post("/generate-and-publish")
async def generate_and_publish_editorial(payload: EditorialGenerateRequest, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    obj = await generate_editorial_object(
        db,
        object_type=payload.object_type,
        theme_slug=payload.theme_slug,
        publish_now=True,
    )
    response: dict = {
        "id": obj.id,
        "object_type": obj.object_type,
        "status": obj.status,
        "title": obj.title,
        "slug": obj.slug,
        "published_at": obj.published_at,
    }
    if payload.immediate_social:
        posts = await generate_social_posts(db, obj, publish_now=True)
        for post in posts:
            if post.status != "published":
                continue
            publish_response = await dispatch_social_post(post, force_dry_run=not controls["x_live_posting"])
            post.meta = {**(post.meta or {}), "publish_response": publish_response}
        await db.commit()
        response["social_post_ids"] = [post.id for post in posts]
        response["social_generated"] = len(posts)
    return response


@router.get("/objects")
async def list_editorial(limit: int = 50, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(EditorialObject).order_by(EditorialObject.created_at.desc()).limit(limit))).scalars().all()
    return [_serialize_editorial(row) for row in rows]


@router.get("/objects/by-slug/{slug}")
async def get_editorial_by_slug(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(EditorialObject).where(EditorialObject.slug == slug))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Editorial object not found")
    return _serialize_editorial(row, include_body=True)


@router.get("/objects/{object_id}")
async def get_editorial(object_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(EditorialObject).where(EditorialObject.id == object_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Editorial object not found")
    return _serialize_editorial(row, include_body=True)


@router.post("/objects/{object_id}/approve")
async def approve_editorial(object_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(EditorialObject).where(EditorialObject.id == object_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Editorial object not found")
    row.status = "approved"
    row.updated_at = datetime.utcnow()
    await db.commit()

    await record_revision(
        db,
        object_table="editorial_objects",
        object_id=row.id,
        action="approved",
        snapshot={"status": row.status},
    )
    return {"id": row.id, "status": row.status}


@router.post("/objects/{object_id}/publish")
async def publish_editorial(object_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(EditorialObject).where(EditorialObject.id == object_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Editorial object not found")

    if settings.enable_manual_review and row.status != "approved":
        raise HTTPException(status_code=409, detail="Manual review enabled; approve before publishing")

    style_gate = evaluate_style_gate(row.body_md or "", lane="editorial")
    if not style_gate.get("passes", False):
        raise HTTPException(status_code=409, detail={"message": "Style gate rejected publish", "style_gate": style_gate})

    row.status = "published"
    row.published_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    await db.commit()

    await record_revision(
        db,
        object_table="editorial_objects",
        object_id=row.id,
        action="published",
        snapshot={"status": row.status, "published_at": row.published_at.isoformat()},
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
    return {"id": row.id, "status": row.status, "published_at": row.published_at}


@router.post("/objects/{object_id}/social/generate")
async def generate_editorial_social(object_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(EditorialObject).where(EditorialObject.id == object_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Editorial object not found")

    controls = await get_runtime_controls(db)
    posts = await generate_social_posts(db, row, publish_now=controls["direct_publish"])
    if controls["direct_publish"]:
        for post in posts:
            if post.status != "published":
                continue
            publish_response = await dispatch_social_post(post, force_dry_run=not controls["x_live_posting"])
            post.meta = {**(post.meta or {}), "publish_response": publish_response}
        await db.commit()
    return {"editorial_object_id": object_id, "generated_posts": len(posts), "post_ids": [p.id for p in posts]}
