from fastapi import APIRouter

from app.schemas import QuestOut
from app.services.quest import generate_daily_quest

router = APIRouter(prefix="/quests", tags=["quests"])


@router.get("/today", response_model=QuestOut)
def quest_today():
    return generate_daily_quest()
