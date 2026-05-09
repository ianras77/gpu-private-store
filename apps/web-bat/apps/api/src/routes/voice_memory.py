from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import VoiceMemory
from schemas import VoiceMemoryIn
from services.editorial_service import update_voice_memory

router = APIRouter(prefix="/voice-memory", tags=["voice-memory"])


@router.get("")
async def list_voice_memory(limit: int = 100, db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(VoiceMemory).order_by(VoiceMemory.updated_at.desc()).limit(limit))).scalars().all()
    return [
        {
            "id": row.id,
            "memory_type": row.memory_type,
            "key": row.key,
            "value": row.value,
            "weight": float(row.weight or 1),
            "updated_at": row.updated_at,
        }
        for row in rows
    ]


@router.post("")
async def upsert_voice_memory(payload: VoiceMemoryIn, db: AsyncSession = Depends(get_db)) -> dict:
    memory = await update_voice_memory(
        db,
        memory_type=payload.memory_type,
        key=payload.key,
        value=payload.value,
        weight=payload.weight,
    )
    return {
        "id": memory.id,
        "memory_type": memory.memory_type,
        "key": memory.key,
        "value": memory.value,
        "weight": float(memory.weight or 1),
        "updated_at": memory.updated_at,
    }
