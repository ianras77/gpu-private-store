from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_tenant_id
from app.data import catalog, store
from app.data.store import TemplateExtractionError
from app.db.migrate import run_migrations

router = APIRouter(prefix="/templates", tags=["templates"])
FILE_REQUIRED = File(...)


class TemplateListItem(BaseModel):
    template_id: str
    filename: str
    storage_key: str | None = None
    created_at: datetime | None = None


class TemplateListResponse(BaseModel):
    templates: list[TemplateListItem]


class TemplateUploadResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_id: str
    filename: str
    storage_key: str | None
    template_schema: dict[str, Any] = Field(alias="schema")
    created_at: datetime | None = None


def _ensure_template_state(tenant_id: str) -> None:
    run_migrations()
    catalog.ensure_tenant(tenant_id)


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    tenant_id: str = Depends(get_tenant_id),
) -> TemplateListResponse:
    _ensure_template_state(tenant_id)
    items = [TemplateListItem(**row) for row in catalog.list_templates(tenant_id)]
    return TemplateListResponse(templates=items)


@router.get("/{template_id}", response_model=TemplateUploadResponse)
async def get_template(
    template_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> TemplateUploadResponse:
    _ensure_template_state(tenant_id)
    template = catalog.get_template(tenant_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="template not found")
    return TemplateUploadResponse(**template)


@router.post("/upload", response_model=TemplateUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_template(
    file: UploadFile = FILE_REQUIRED,
    tenant_id: str = Depends(get_tenant_id),
) -> TemplateUploadResponse:
    _ensure_template_state(tenant_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required")

    safe_name = Path(file.filename).name
    template_id = f"tmpl_{uuid4().hex[:12]}"
    upload_dir = store.DATA_DIR / "tenants" / tenant_id / "templates" / template_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    upload_path = upload_dir / safe_name

    with upload_path.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)
    await file.close()

    try:
        schema, storage_key = store.extract_template_schema(
            tenant_id=tenant_id,
            template_id=template_id,
            path=upload_path,
            filename=safe_name,
        )
    except TemplateExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    template = catalog.get_template(tenant_id, template_id)
    return TemplateUploadResponse(
        template_id=template_id,
        filename=safe_name,
        storage_key=storage_key,
        schema=schema,
        created_at=template.get("created_at") if template else None,
    )
