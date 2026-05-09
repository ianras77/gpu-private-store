import re

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from services.analysis_engine import build_analysis_dashboard, refresh_analysis_briefs
from services.editorial_service import get_runtime_controls

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _split_directive_queries(raw: str) -> list[str]:
    if not raw.strip():
        return []
    return [part.strip() for part in re.split(r"[\n|]+", raw) if part.strip()]


@router.get("")
async def analysis_dashboard(
    story_limit: int = 4,
    memory_limit: int = 8,
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await build_analysis_dashboard(db, story_limit=max(1, min(story_limit, 10)), memory_limit=max(4, min(memory_limit, 20)))


@router.post("/refresh")
async def refresh_analysis(db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    query_plan = _split_directive_queries(str(controls.get("analysis_directive") or controls.get("research_directive") or ""))
    return await refresh_analysis_briefs(
        db,
        query_plan=query_plan or None,
        directive_queries=query_plan or None,
    )
