from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.schemas import DeviceOut, DeviceRegister
from app.models import Device
from app.services.devices import upsert_device

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.query(Device)
        .filter(Device.user_id == user.id)
        .order_by(Device.last_sync_at.is_(None), Device.last_sync_at.desc(), Device.last_seen_at.desc(), Device.created_at.desc())
        .all()
    )


@router.post("/register", response_model=DeviceOut)
def register_device(payload: DeviceRegister, db: Session = Depends(get_db), user=Depends(get_current_user)):
    device, _ = upsert_device(db, user.id, payload)
    db.commit()
    db.refresh(device)
    return device
