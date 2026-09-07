from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=80)
    directive: str = Field(min_length=1, max_length=4000)


class ReportArtifactCreate(BaseModel):
    run_id: UUID
    slug: str = Field(min_length=1, max_length=180)
    kind: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=500)
    artifact: dict
    source_ids: list[UUID] = []


def require_internal(authorization: str | None) -> None:
    if authorization != f"Bearer {settings.bat_internal_service_token}":
        raise HTTPException(status_code=401, detail="Internal service authorization required")


@router.get("")
async def list_reports(limit: int = 50, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(text("select id, slug, status, kind, title, created_at, published_at from report_artifacts order by created_at desc limit :limit").bindparams(limit=max(1, min(limit, 100))))).mappings().all()
    return [dict(row) for row in rows]


@router.get("/{report_id}")
async def get_report(report_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(text("select id, run_id, slug, status, kind, title, artifact, source_ids, created_at, updated_at, published_at from report_artifacts where id=:id").bindparams(id=report_id))).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return dict(row)


@router.get("/slug/{slug}")
async def get_report_by_slug(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(text("select id, run_id, slug, status, kind, title, artifact, source_ids, created_at, updated_at, published_at from report_artifacts where slug=:slug").bindparams(slug=slug))).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return dict(row)


@router.post("/runs", status_code=202)
async def create_report_run(payload: ReportCreate, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    require_internal(authorization)
    row = (await db.execute(text("insert into report_runs (status, kind, directive, current_stage) values ('queued', :kind, :directive, 'queued') returning id, status, kind, directive, current_stage, created_at").bindparams(kind=payload.kind, directive=payload.directive))).mappings().one()
    await db.commit()
    return dict(row)


@router.post("/{report_id}/publish")
async def publish_report(report_id: UUID, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    require_internal(authorization)
    result = await db.execute(text("update report_artifacts set status='published', published_at=:now, updated_at=:now where id=:id and status in ('ready','draft') returning id, status, published_at").bindparams(id=report_id, now=datetime.utcnow()))
    row = result.mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=409, detail="Report is not ready or does not exist")
    await db.commit()
    return dict(row)


@router.post("/artifacts", status_code=201)
async def persist_report_artifact(payload: ReportArtifactCreate, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    require_internal(authorization)
    row = (await db.execute(text("insert into report_artifacts (run_id, slug, status, kind, title, artifact, source_ids) values (:run_id, :slug, 'ready', :kind, :title, cast(:artifact as jsonb), :source_ids) returning id, run_id, slug, status, kind, title, created_at").bindparams(run_id=payload.run_id, slug=payload.slug, kind=payload.kind, title=payload.title, artifact=__import__('json').dumps(payload.artifact), source_ids=payload.source_ids))).mappings().one()
    await db.execute(text("update report_runs set status='ready', current_stage='ready', updated_at=now(), completed_at=now() where id=:id").bindparams(id=payload.run_id))
    await db.commit()
    return dict(row)
