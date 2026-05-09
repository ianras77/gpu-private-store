from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import TrendObservation
from services.trend_engine import rebuild_themes

router = APIRouter(prefix="/trends", tags=["trends"])


@router.post("/refresh")
async def refresh_trends(db: AsyncSession = Depends(get_db)) -> dict:
    return await rebuild_themes(db)


@router.get("")
async def list_trends(limit: int = 50, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(TrendObservation).order_by(TrendObservation.observation_date.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "observation_date": row.observation_date,
            "title": row.title,
            "summary": row.summary,
            "change_type": row.change_type,
            "confidence": float(row.confidence or 0),
            "metadata": row.meta,
        }
        for row in rows
    ]
