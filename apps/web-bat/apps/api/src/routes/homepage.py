from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import HomepageSnapshot
from services.editorial_service import generate_homepage_snapshot, get_runtime_controls
from services.revision_service import record_revision

router = APIRouter(prefix="/homepage", tags=["homepage"])


@router.post("/generate")
async def generate_homepage(publish_now: bool = False, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    snapshot = await generate_homepage_snapshot(db, publish_now=bool(publish_now or controls["direct_publish"]))
    return {"id": snapshot.id, "status": snapshot.status, "layout_json": snapshot.layout_json}


@router.post("/generate-and-publish")
async def generate_and_publish_homepage(db: AsyncSession = Depends(get_db)) -> dict:
    snapshot = await generate_homepage_snapshot(db, publish_now=True)
    return {"id": snapshot.id, "status": snapshot.status, "layout_json": snapshot.layout_json, "published_at": snapshot.published_at}


@router.get("/snapshots")
async def list_homepage_snapshots(limit: int = 30, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(HomepageSnapshot).order_by(HomepageSnapshot.created_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "status": row.status,
            "layout_json": row.layout_json,
            "rationale": row.rationale,
            "created_at": row.created_at,
            "published_at": row.published_at,
        }
        for row in rows
    ]


@router.post("/snapshots/{snapshot_id}/approve")
async def approve_snapshot(snapshot_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(HomepageSnapshot).where(HomepageSnapshot.id == snapshot_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    row.status = "approved"
    await db.commit()

    await record_revision(
        db,
        object_table="homepage_snapshots",
        object_id=row.id,
        action="approved",
        snapshot={"status": row.status},
    )
    return {"id": row.id, "status": row.status}


@router.post("/snapshots/{snapshot_id}/publish")
async def publish_snapshot(snapshot_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(HomepageSnapshot).where(HomepageSnapshot.id == snapshot_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    if settings.enable_manual_review and row.status != "approved":
        raise HTTPException(status_code=409, detail="Manual review enabled; approve before publishing")

    row.status = "published"
    row.published_at = datetime.utcnow()
    await db.commit()

    await record_revision(
        db,
        object_table="homepage_snapshots",
        object_id=row.id,
        action="published",
        snapshot={"status": row.status},
    )
    return {"id": row.id, "status": row.status, "published_at": row.published_at}
