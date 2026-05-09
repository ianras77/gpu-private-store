from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_tenant_id, get_user_id
from app.data import catalog, store, workstreams
from app.data.store import DatasetNotFound

router = APIRouter(prefix="/workstreams", tags=["workstreams"])


class WorkstreamCreateRequest(BaseModel):
    dataset_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    steps: list[dict[str, Any]] = Field(min_length=1)
    description: str | None = Field(default=None, max_length=500)


class WorkstreamResponse(BaseModel):
    workstream_id: str
    user_id: str
    name: str
    description: str | None = None
    recipe_steps: list[dict[str, Any]]
    match_signature: dict[str, Any]


class WorkstreamListResponse(BaseModel):
    workstreams: list[WorkstreamResponse]


class WorkstreamRecognizeRequest(BaseModel):
    dataset_id: str = Field(min_length=1)
    min_score: float = Field(default=0.6, ge=0.0, le=1.0)
    limit: int = Field(default=5, ge=1, le=50)


class WorkstreamMatchResponse(BaseModel):
    workstream_id: str
    name: str
    score: float
    matched_columns: int
    required_columns: int


class WorkstreamRecognizeResponse(BaseModel):
    dataset_id: str
    matches: list[WorkstreamMatchResponse]


class WorkstreamRecommendRequest(BaseModel):
    dataset_id: str = Field(min_length=1)
    limit: int = Field(default=4, ge=1, le=10)


class WorkstreamRecommendationResponse(BaseModel):
    recommendation_id: str
    name: str
    summary: str
    confidence: float
    rationale: list[str]
    suggested_steps: list[dict[str, Any]]
    output_targets: list[str]
    prompt_hint: str


class WorkstreamRecommendResponse(BaseModel):
    dataset_id: str
    recommendations: list[WorkstreamRecommendationResponse]


class WorkstreamRunRequest(BaseModel):
    dataset_id: str = Field(min_length=1)


class WorkstreamRunResponse(BaseModel):
    run_id: str
    workstream_id: str
    dataset_id: str
    output_version_id: str | None = None
    row_count: int | None = None
    status: str


@router.post("", response_model=WorkstreamResponse, status_code=status.HTTP_201_CREATED)
async def create_workstream(
    payload: WorkstreamCreateRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> WorkstreamResponse:
    warnings = store.validate_recipe_steps(payload.steps)
    blocking = [warning for warning in warnings if warning.startswith("Unsupported")]
    if blocking:
        raise HTTPException(status_code=400, detail={"errors": blocking})

    try:
        profile = store.get_profile(tenant_id, payload.dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    signature = workstreams.build_signature_from_profile(profile)
    created = catalog.create_workstream(
        tenant_id=tenant_id,
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        recipe_steps=payload.steps,
        match_signature=signature,
        metadata={"source_dataset_id": payload.dataset_id},
    )
    return WorkstreamResponse(**created)


@router.get("", response_model=WorkstreamListResponse)
async def list_user_workstreams(
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> WorkstreamListResponse:
    rows = catalog.list_workstreams(tenant_id, user_id=user_id)
    payload = [
        WorkstreamResponse(
            workstream_id=row["workstream_id"],
            user_id=row["user_id"],
            name=row["name"],
            description=row.get("description"),
            recipe_steps=row.get("recipe_steps") or [],
            match_signature=row.get("match_signature") or {},
        )
        for row in rows
    ]
    return WorkstreamListResponse(workstreams=payload)


@router.post("/recognize", response_model=WorkstreamRecognizeResponse)
async def recognize_workstreams(
    payload: WorkstreamRecognizeRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> WorkstreamRecognizeResponse:
    try:
        profile = store.get_profile(tenant_id, payload.dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    signature = workstreams.build_signature_from_profile(profile)
    known = catalog.list_workstreams(tenant_id, user_id=user_id)
    matches = workstreams.recognize_workstreams(
        signature,
        known,
        min_score=payload.min_score,
        limit=payload.limit,
    )
    return WorkstreamRecognizeResponse(dataset_id=payload.dataset_id, matches=matches)


@router.post("/recommend", response_model=WorkstreamRecommendResponse)
async def recommend_workstreams(
    payload: WorkstreamRecommendRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> WorkstreamRecommendResponse:
    # `user_id` is resolved intentionally for future per-user recommendation tuning.
    _ = user_id
    try:
        profile = store.get_profile(tenant_id, payload.dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    recommendations = workstreams.recommend_workstream_templates(
        profile,
        limit=payload.limit,
    )
    return WorkstreamRecommendResponse(
        dataset_id=payload.dataset_id,
        recommendations=recommendations,
    )


@router.post("/{workstream_id}/run", response_model=WorkstreamRunResponse)
async def run_workstream(
    workstream_id: str,
    payload: WorkstreamRunRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> WorkstreamRunResponse:
    workstream = catalog.get_workstream(tenant_id, workstream_id)
    if not workstream:
        raise HTTPException(status_code=404, detail="workstream not found")
    if workstream["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="forbidden")

    try:
        result = store.run_recipe(
            tenant_id,
            payload.dataset_id,
            workstream.get("recipe_steps") or [],
            recipe_name=workstream.get("name"),
        )
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail="dataset not found") from exc

    run = catalog.create_workstream_run(
        tenant_id=tenant_id,
        workstream_id=workstream_id,
        user_id=user_id,
        dataset_id=payload.dataset_id,
        status="completed",
        output_version_id=result.get("version_id"),
    )
    return WorkstreamRunResponse(
        run_id=run["run_id"],
        workstream_id=workstream_id,
        dataset_id=payload.dataset_id,
        output_version_id=result.get("version_id"),
        row_count=result.get("row_count"),
        status="completed",
    )
