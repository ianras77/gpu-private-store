from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import SocialPost
from schemas import SocialLiveRequest
from services.editorial_service import evaluate_style_gate, generate_live_social_post, get_runtime_controls, record_voice_learning_from_publication
from services.revision_service import record_revision
from services.social_dispatcher import dispatch_social_post

router = APIRouter(prefix="/social", tags=["social"])


async def _dispatch_social_post(row: SocialPost, *, force_dry_run: bool = False) -> dict:
    return await dispatch_social_post(row, force_dry_run=force_dry_run)


@router.get("/posts")
async def list_social_posts(limit: int = 100, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(SocialPost).order_by(SocialPost.created_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "platform": row.platform,
            "status": row.status,
            "body": row.body,
            "thread_group": row.thread_group,
            "metadata": row.meta,
            "created_at": row.created_at,
            "published_at": row.published_at,
        }
        for row in rows
    ]


@router.post("/posts/{post_id}/approve")
async def approve_social_post(post_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(SocialPost).where(SocialPost.id == post_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Social post not found")

    row.status = "approved"
    await db.commit()

    await record_revision(
        db,
        object_table="social_posts",
        object_id=row.id,
        action="approved",
        snapshot={"status": row.status},
    )
    return {"id": row.id, "status": row.status}


@router.post("/posts/{post_id}/publish")
async def publish_social_post(post_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(SocialPost).where(SocialPost.id == post_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Social post not found")

    if settings.enable_manual_review and row.status != "approved":
        raise HTTPException(status_code=409, detail="Manual review enabled; approve before publishing")

    style_gate = evaluate_style_gate(row.body, lane="social")
    if not style_gate.get("passes", False):
        raise HTTPException(status_code=409, detail={"message": "Style gate rejected publish", "style_gate": style_gate})

    controls = await get_runtime_controls(db)
    response_payload = await _dispatch_social_post(row, force_dry_run=not controls["x_live_posting"])

    row.status = "published"
    row.published_at = datetime.utcnow()
    row.meta = {**(row.meta or {}), "publish_response": response_payload}
    await db.commit()

    await record_revision(
        db,
        object_table="social_posts",
        object_id=row.id,
        action="published",
        snapshot={"status": row.status, "response": response_payload},
    )
    await record_voice_learning_from_publication(
        db,
        lane="social",
        title=(row.meta or {}).get("variant", "x-post"),
        body=row.body,
    )
    return {"id": row.id, "status": row.status, "publish_response": response_payload}


@router.post("/live")
async def publish_live_social(payload: SocialLiveRequest, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    should_publish = bool(payload.publish_now or controls["direct_publish"])
    post = await generate_live_social_post(
        db,
        prompt=payload.prompt,
        intent=payload.intent,
        platform=payload.platform,
        publish_now=should_publish,
    )

    publish_response: dict | None = None
    if post.status == "published":
        publish_response = await _dispatch_social_post(post, force_dry_run=not controls["x_live_posting"])
        post.meta = {**(post.meta or {}), "publish_response": publish_response}
        await db.commit()

        await record_revision(
            db,
            object_table="social_posts",
            object_id=post.id,
            action="published_live_dispatched",
            snapshot={"status": post.status, "response": publish_response},
        )

    return {
        "id": post.id,
        "status": post.status,
        "platform": post.platform,
        "body": post.body,
        "publish_response": publish_response,
    }
