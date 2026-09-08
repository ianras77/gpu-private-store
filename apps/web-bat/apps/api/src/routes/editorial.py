from datetime import datetime
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import EditorialObject
from services.editorial_service import (
    derive_editorial_title,
    evaluate_style_gate,
    record_voice_learning_from_publication,
)
from services.revision_service import record_revision

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


@router.get("/objects")
async def list_editorial(
    limit: int = 50,
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    query = select(EditorialObject).order_by(EditorialObject.created_at.desc()).limit(limit)
    if status:
        query = query.where(EditorialObject.status == status)
    rows = (await db.execute(query)).scalars().all()
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
