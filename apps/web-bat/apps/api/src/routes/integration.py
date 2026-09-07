from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from config import settings
from db import get_db
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/integration", tags=["mastra-integration"])


def _require_internal(authorization: str | None) -> None:
    if authorization != f"Bearer {settings.bat_internal_service_token}":
        raise HTTPException(status_code=401, detail="Internal service authorization required")


class RunCreate(BaseModel):
    workflow: str = Field(min_length=1, max_length=100)
    directive: str = Field(min_length=1, max_length=4000)
    workflow_version: str = Field(default="mastra-bat-1", max_length=80)
    persona_snapshot: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)


class StageCreate(BaseModel):
    stage: str = Field(min_length=1, max_length=100)
    agent: str = Field(min_length=1, max_length=100)
    status: str = Field(default="completed", max_length=40)
    attempt: int = Field(default=1, ge=1, le=20)
    input: dict = Field(default_factory=dict)
    output: dict = Field(default_factory=dict)
    source_ids: list[UUID] = Field(default_factory=list)
    provider: dict = Field(default_factory=dict)
    error: str | None = None


class RunComplete(BaseModel):
    status: str = Field(pattern="^(completed|failed|blocked|published)$")
    error: str | None = None


class PublicationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    dek: str = Field(default="", max_length=2000)
    body_md: str = Field(min_length=1, max_length=100000)
    source_ids: list[UUID] = Field(min_length=3, max_length=20)
    metadata: dict = Field(default_factory=dict)


@router.get("/status")
async def integration_status(db: AsyncSession = Depends(get_db)) -> dict:
    counts = (await db.execute(text("""
        select
          (select count(*) from editorial_runs) as runs,
          (select count(*) from editorial_stage_runs) as stages,
          (select count(*) from persona_memory where active) as active_persona_memory,
          (select count(*) from publication_packages) as packages,
          (select count(*) from publication_packages where status='published') as published_packages
    """))).mappings().one()
    latest = (await db.execute(text("""
        select id, workflow, status, directive, created_at, started_at, completed_at, published_at
        from editorial_runs order by created_at desc limit 1
    """))).mappings().one_or_none()
    return {"orchestrator": "mastra", "contract_version": "mastra-bat-1", "counts": dict(counts), "latest_run": dict(latest) if latest else None}


@router.get("/persona-context")
async def persona_context(limit: int = 12, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    _require_internal(authorization)
    memories = (await db.execute(text("""
        select kind, content, confidence, metadata, updated_at
        from persona_memory where active order by confidence desc, updated_at desc limit :limit
    """).bindparams(limit=max(1, min(limit, 40))))).mappings().all()
    voice = (await db.execute(text("""
        select memory_type, key, value, weight, updated_at
        from voice_memory order by weight desc, updated_at desc limit :limit
    """).bindparams(limit=max(1, min(limit, 40))))).mappings().all()
    recent = (await db.execute(text("""
        select id, title, dek, summary, published_at
        from editorial_objects where status='published' order by published_at desc nulls last limit :limit
    """).bindparams(limit=max(1, min(limit, 12))))).mappings().all()
    return {"constitution": "Mirror, Pin, Twist: polished, warm, specific, cutting only when the receipts earn it.",
            "persona_memory": [dict(row) for row in memories], "voice_memory": [dict(row) for row in voice],
            "recent_published": [dict(row) for row in recent]}


@router.post("/runs", status_code=201)
async def create_run(payload: RunCreate, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    _require_internal(authorization)
    row = (await db.execute(text("""
        insert into editorial_runs (workflow, workflow_version, status, directive, persona_snapshot, metadata, started_at)
        values (:workflow, :workflow_version, 'running', :directive, cast(:persona_snapshot as jsonb), cast(:metadata as jsonb), now())
        returning id, workflow, workflow_version, status, directive, created_at, started_at
    """).bindparams(workflow=payload.workflow, workflow_version=payload.workflow_version, directive=payload.directive,
                    persona_snapshot=json.dumps(payload.persona_snapshot), metadata=json.dumps(payload.metadata)))).mappings().one()
    await db.commit()
    return dict(row)


@router.post("/runs/{run_id}/stages", status_code=201)
async def record_stage(run_id: UUID, payload: StageCreate, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    _require_internal(authorization)
    exists = await db.scalar(text("select 1 from editorial_runs where id=:id").bindparams(id=run_id))
    if not exists:
        raise HTTPException(status_code=404, detail="Editorial run not found")
    row = (await db.execute(text("""
        insert into editorial_stage_runs (run_id, stage, agent, status, attempt, input, output, source_ids, provider, error, started_at, completed_at)
        values (:run_id, :stage, :agent, :status, :attempt, cast(:input as jsonb), cast(:output as jsonb), :source_ids, cast(:provider as jsonb), :error, now(), case when :status='completed' then now() else null end)
        returning id, run_id, stage, agent, status, attempt, created_at, completed_at
    """).bindparams(run_id=run_id, stage=payload.stage, agent=payload.agent, status=payload.status, attempt=payload.attempt,
                    input=json.dumps(payload.input), output=json.dumps(payload.output), source_ids=payload.source_ids,
                    provider=json.dumps(payload.provider), error=payload.error))).mappings().one()
    await db.execute(text("update editorial_runs set updated_at=now() where id=:id").bindparams(id=run_id))
    await db.commit()
    return dict(row)


@router.get("/runs/{run_id}")
async def get_run(run_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    run = (await db.execute(text("select * from editorial_runs where id=:id").bindparams(id=run_id))).mappings().one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Editorial run not found")
    stages = (await db.execute(text("select * from editorial_stage_runs where run_id=:id order by created_at").bindparams(id=run_id))).mappings().all()
    package = (await db.execute(text("select * from publication_packages where run_id=:id").bindparams(id=run_id))).mappings().one_or_none()
    return {"run": dict(run), "stages": [dict(stage) for stage in stages], "publication_package": dict(package) if package else None}


@router.post("/runs/{run_id}/complete")
async def complete_run(run_id: UUID, payload: RunComplete, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    _require_internal(authorization)
    now = datetime.utcnow()
    result = await db.execute(text("""
        update editorial_runs
        set status=:status, error=:error, updated_at=:now, completed_at=:now,
            published_at=case when :status='published' then :now else published_at end
        where id=:id and status not in ('published', 'failed')
        returning id, status, completed_at, published_at
    """).bindparams(id=run_id, status=payload.status, error=payload.error, now=now))
    row = result.mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=409, detail="Run is missing or already terminal")
    await db.commit()
    return dict(row)


@router.post("/runs/{run_id}/publish", status_code=201)
async def publish_run(run_id: UUID, payload: PublicationCreate, authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)) -> dict:
    """Atomically turn a completed Mastra run into a public editorial object."""
    _require_internal(authorization)
    run = (await db.execute(text("select id, status from editorial_runs where id=:id for update").bindparams(id=run_id))).mappings().one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Editorial run not found")
    if run["status"] not in ("completed", "ready"):
        raise HTTPException(status_code=409, detail="Run is not publishable")
    slug = "-".join("".join(char.lower() if char.isalnum() else "-" for char in payload.title).split("-"))[:120].strip("-")
    slug = f"{slug}-{str(run_id)[:8]}"
    metadata = {**payload.metadata, "mastra": {"run_id": str(run_id), "orchestrator": "mastra", "source_ids": [str(item) for item in payload.source_ids]}}
    now = datetime.utcnow()
    try:
        editorial = (await db.execute(text("""
            insert into editorial_objects (object_type, status, title, slug, dek, body_md, summary, voice_profile, primary_source_ids, metadata, created_at, updated_at, published_at)
            values ('lead_story', 'published', :title, :slug, :dek, :body_md, :dek, 'mastra-person-blogger', cast(:source_ids as jsonb), cast(:metadata as jsonb), :now, :now, :now)
            returning id, title, slug, status, published_at
        """).bindparams(title=payload.title, slug=slug, dek=payload.dek, body_md=payload.body_md,
                        source_ids=json.dumps([str(item) for item in payload.source_ids]), metadata=json.dumps(metadata), now=now))).mappings().one()
        await db.execute(text("""
            insert into persona_memory (kind, content, source_run_id, source_object_id, confidence, metadata)
            values ('published_thread', :content, :run_id, :object_id, 1.0, cast(:metadata as jsonb))
        """).bindparams(content=f"Published: {payload.title} — {payload.dek}", run_id=run_id, object_id=editorial["id"], metadata=json.dumps({"orchestrator": "mastra", "source_ids": [str(item) for item in payload.source_ids]})))
        homepage = (await db.execute(text("""
            insert into homepage_snapshots (status, layout_json, rationale, created_at, published_at)
            values ('published', cast(:layout as jsonb), :rationale, :now, :now)
            returning id, status, published_at
        """).bindparams(layout=json.dumps({"mastra_run_id": str(run_id), "lead_story_id": str(editorial["id"]), "lead_story": {"title": payload.title, "dek": payload.dek}, "source_ids": [str(item) for item in payload.source_ids]}), rationale="Mastra person-blogger publication package", now=now))).mappings().one()
        package = (await db.execute(text("""
            insert into publication_packages (run_id, editorial_object_id, homepage_snapshot_id, status, package, source_ids, published_at)
            values (:run_id, :editorial_id, :homepage_id, 'published', cast(:package as jsonb), :source_ids, :now)
            returning id, run_id, editorial_object_id, homepage_snapshot_id, status, published_at
        """).bindparams(run_id=run_id, editorial_id=editorial["id"], homepage_id=homepage["id"], package=json.dumps({"title": payload.title, "dek": payload.dek, "body_md": payload.body_md, "metadata": metadata}), source_ids=[str(item) for item in payload.source_ids], now=now))).mappings().one()
        await db.execute(text("update editorial_runs set status='published', updated_at=:now, completed_at=coalesce(completed_at,:now), published_at=:now where id=:id").bindparams(id=run_id, now=now))
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"editorial": dict(editorial), "homepage": dict(homepage), "publication_package": dict(package), "run_id": str(run_id)}
