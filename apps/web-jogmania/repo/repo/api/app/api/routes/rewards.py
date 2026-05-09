from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models import Reward, InventoryItem
from app.schemas import RewardOut, InventoryItemOut
from app.services.starter_content import ensure_user_baseline

router = APIRouter(tags=["rewards"])


@router.get("/rewards", response_model=list[RewardOut])
def list_rewards(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if ensure_user_baseline(db, user.id):
        db.commit()
    rewards = db.query(Reward).filter(Reward.user_id == user.id).order_by(Reward.earned_at.desc()).all()
    return rewards


@router.get("/inventory", response_model=list[InventoryItemOut])
def list_inventory(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if ensure_user_baseline(db, user.id):
        db.commit()
    items = db.query(InventoryItem).filter(InventoryItem.user_id == user.id).order_by(InventoryItem.updated_at.desc()).all()
    return items
