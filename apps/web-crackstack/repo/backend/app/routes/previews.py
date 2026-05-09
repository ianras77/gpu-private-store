from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_tenant_id
from app.data import store
from app.data.store import DatasetNotFound

router = APIRouter(prefix="/previews", tags=["previews"])


class TransformSpec(BaseModel):
    target_columns: list[dict[str, Any]] = Field(default_factory=list)
    unmapped_source_columns: list[str] = Field(default_factory=list)
    unfilled_target_columns: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PreviewRequest(BaseModel):
    dataset_id: str
    spec: TransformSpec


class PreviewResponse(BaseModel):
    dataset_id: str
    before_rows: int
    after_rows: int
    row_delta_pct: float
    warnings: list[str]


@router.post("", response_model=PreviewResponse, status_code=status.HTTP_200_OK)
async def preview_transform(
    payload: PreviewRequest,
    tenant_id: str = Depends(get_tenant_id),
) -> PreviewResponse:
    try:
        store.get_profile(tenant_id, payload.dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    # Reuse existing recipe preview (operates on latest version)
    steps = [
        {
            "type": "select",
            "columns": [
                tc["source"][0] for tc in payload.spec.target_columns if tc.get("source")
            ],
        }
    ]
    preview = store.preview_recipe(tenant_id, payload.dataset_id, steps)
    warnings = list(payload.spec.warnings)
    return PreviewResponse(
        dataset_id=payload.dataset_id,
        before_rows=preview["before_rows"],
        after_rows=preview["after_rows"],
        row_delta_pct=preview["row_delta_pct"],
        warnings=warnings,
    )
