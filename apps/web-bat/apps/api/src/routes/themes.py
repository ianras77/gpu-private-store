from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import Theme

router = APIRouter(prefix="/themes", tags=["themes"])


@router.get("")
async def list_themes(limit: int = 50, db: AsyncSession = Depends(get_db)) -> list[dict]:
    themes = (await db.execute(select(Theme).order_by(Theme.active_score.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": t.id,
            "slug": t.slug,
            "name": t.name,
            "description": t.description,
            "active_score": float(t.active_score or 0),
            "last_seen_at": t.last_seen_at,
            "metadata": t.meta,
        }
        for t in themes
    ]
