from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_tenant_id
from app.data import catalog, mapping, store
from app.data.store import DatasetNotFound

router = APIRouter(prefix="/transforms", tags=["transforms"])


class PlanRequest(BaseModel):
    dataset_id: str
    mode: Literal["template"]
    template_id: str = Field(..., description="Template to map to")


class PlanResponse(BaseModel):
    mapping: dict[str, Any]
    dataset_id: str
    template_id: str


@router.post("/plan", response_model=PlanResponse, status_code=status.HTTP_200_OK)
async def plan_transform(
    payload: PlanRequest, tenant_id: str = Depends(get_tenant_id)
) -> PlanResponse:
    try:
        profile = store.get_profile(tenant_id, payload.dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    template = catalog.get_template(tenant_id, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="template not found")

    suggestion = mapping.plan_mapping(profile, template["schema"])
    return PlanResponse(
        mapping=suggestion,
        dataset_id=payload.dataset_id,
        template_id=payload.template_id,
    )
