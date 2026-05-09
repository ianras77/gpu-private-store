from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import get_tenant_id, get_user_id
from app.data import catalog
from app.db.migrate import run_migrations

router = APIRouter(prefix="/users", tags=["users"])


class UserSignupRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] | None = None


class UserProfileResponse(BaseModel):
    user_id: str
    display_name: str
    registered: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


@router.post("/signup", response_model=UserProfileResponse)
async def signup_user(
    payload: UserSignupRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> UserProfileResponse:
    run_migrations()
    catalog.ensure_tenant(tenant_id)
    display_name = (payload.display_name or "").strip() or user_id
    profile = catalog.upsert_user_profile(
        tenant_id=tenant_id,
        user_id=user_id,
        display_name=display_name,
        metadata=payload.metadata,
    )
    return UserProfileResponse(
        user_id=profile["user_id"],
        display_name=profile["display_name"],
        registered=True,
        created_at=profile.get("created_at"),
        updated_at=profile.get("updated_at"),
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user(
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> UserProfileResponse:
    run_migrations()
    catalog.ensure_tenant(tenant_id)
    profile = catalog.get_user_profile(tenant_id, user_id)
    if not profile:
        return UserProfileResponse(
            user_id=user_id,
            display_name=user_id,
            registered=False,
        )
    return UserProfileResponse(
        user_id=profile["user_id"],
        display_name=profile["display_name"],
        registered=True,
        created_at=profile.get("created_at"),
        updated_at=profile.get("updated_at"),
    )
