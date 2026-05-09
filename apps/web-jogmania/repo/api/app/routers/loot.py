from fastapi import APIRouter

from app import schemas
from app.services.loot import roll_loot

router = APIRouter(prefix="/loot", tags=["loot"])


@router.post("/roll", response_model=schemas.LootRollOut)
def roll(payload: schemas.LootRollIn):
    items = roll_loot(payload.distance_m, payload.duration_s, payload.avg_pace_s_per_km)
    return {"items": items}
