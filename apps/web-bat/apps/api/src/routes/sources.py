import re

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import Source
from schemas import IngestRequest
from services.editorial_service import get_runtime_controls
from services.ingestion_service import ingest_query, ingest_x_query

router = APIRouter(prefix="/sources", tags=["sources"])


def _directive_queries(raw: str) -> list[str]:
    return [part.strip() for part in re.split(r"[\n|]+", (raw or "").strip()) if part.strip()]


@router.post("/ingest")
async def ingest_sources(payload: IngestRequest, db: AsyncSession = Depends(get_db)) -> dict:
    controls = await get_runtime_controls(db)
    include_x = controls["x_research_enabled"] if payload.include_x is None else payload.include_x
    if payload.use_query_pack:
        query_plan: list[str] = []
        seen_queries: set[str] = set()
        for query in _directive_queries(controls.get("research_directive", "")) + list(settings.query_pack):
            lowered = query.lower()
            if lowered in seen_queries:
                continue
            seen_queries.add(lowered)
            query_plan.append(query)

        summaries = []
        x_summaries = []
        for query in query_plan:
            summaries.append(await ingest_query(db, query=query, limit=payload.limit))
            if include_x:
                x_summaries.append(await ingest_x_query(db, query=query, limit=min(payload.limit, 10)))
        return {
            "mode": "query_pack",
            "query_plan": query_plan,
            "include_x": include_x,
            "summaries": summaries,
            "x_summaries": x_summaries,
        }

    query = payload.query or settings.query_pack[0]
    summary = await ingest_query(db, query=query, limit=payload.limit)
    response = {"mode": "single", "include_x": include_x, "summary": summary}
    if include_x:
        response["x_summary"] = await ingest_x_query(db, query=query, limit=min(payload.limit, 10))
    return response


@router.get("")
async def list_sources(limit: int = 50, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(Source).order_by(Source.fetched_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "source_url": row.source_url,
            "canonical_url": row.canonical_url,
            "fetched_at": row.fetched_at,
            "metadata": row.meta,
        }
        for row in rows
    ]
