from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_tenant_id, get_user_id
from app.data import store
from app.llm.agent import AgentRunError, run_agent

router = APIRouter(prefix="/agent", tags=["agent"])

THREADS: dict[str, dict[str, Any]] = {}


class ThreadCreateRequest(BaseModel):
    brand: str | None = Field(default="xlcrack")
    dataset_id: str | None = None


class ThreadCreateResponse(BaseModel):
    thread_id: str
    created_at: str
    dataset_id: str | None
    brand: str | None


class ChatRequest(BaseModel):
    message: str
    dataset_id: str | None = None


class ChatResponse(BaseModel):
    thread_id: str
    assistant: str
    events: list[dict[str, Any]]


@router.post("/threads", response_model=ThreadCreateResponse)
async def create_thread(
    payload: ThreadCreateRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> ThreadCreateResponse:
    thread_id = str(uuid4())
    dataset_id = payload.dataset_id or store.ensure_demo_dataset(tenant_id)
    THREADS[thread_id] = {
        "history": [],
        "dataset_id": dataset_id,
        "brand": payload.brand,
        "tenant_id": tenant_id,
        "user_id": user_id,
    }
    return ThreadCreateResponse(
        thread_id=thread_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        dataset_id=dataset_id,
        brand=payload.brand,
    )


@router.post("/threads/{thread_id}/chat", response_model=ChatResponse)
async def chat(
    thread_id: str,
    payload: ChatRequest,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_user_id),
) -> ChatResponse:
    thread = THREADS.get(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="thread not found")
    if thread["tenant_id"] != tenant_id:
        raise HTTPException(status_code=403, detail="forbidden")
    if thread["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="forbidden")

    history = thread["history"]
    dataset_id = payload.dataset_id or thread["dataset_id"]
    user_message = payload.message
    if dataset_id:
        user_message = f"Dataset: {dataset_id}\n" + user_message

    try:
        result = run_agent(
            history,
            user_message,
            tenant_id,
            dataset_id,
            user_id=user_id,
        )
    except AgentRunError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    thread["history"] = result["messages"][1:]  # drop system prompt

    return ChatResponse(
        thread_id=thread_id,
        assistant=result["content"],
        events=result["events"],
    )
