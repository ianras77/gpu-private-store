from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Device
from app.schemas import DeviceRegister


def _normalized_platform(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "iphone": "ios",
        "ios-app": "ios",
        "watchos": "watch",
        "apple-watch": "watch"
    }
    return aliases.get(normalized, normalized)


def upsert_device(db: Session, user_id, payload: DeviceRegister) -> tuple[Device, bool]:
    platform = _normalized_platform(payload.platform)
    device = (
        db.query(Device)
        .filter(
            Device.user_id == user_id,
            Device.platform == platform,
            Device.device_id == payload.device_id
        )
        .first()
    )
    created = device is None

    if device is None:
        device = Device(
            user_id=user_id,
            platform=platform,
            device_id=payload.device_id
        )
        db.add(device)

    if payload.name is not None:
        device.name = payload.name
    if payload.companion_device_id is not None:
        device.companion_device_id = payload.companion_device_id
    if payload.metadata_json is not None:
        metadata = dict(device.metadata_json or {})
        metadata.update(payload.metadata_json)
        device.metadata_json = metadata
    device.last_seen_at = datetime.now(timezone.utc)
    db.flush()
    return device, created


def touch_device_sync(
    db: Session,
    user_id,
    *,
    platform: str,
    device_id: str,
    seen_at: datetime | None = None
) -> Device:
    seen_at = seen_at or datetime.now(timezone.utc)
    payload = DeviceRegister(platform=platform, device_id=device_id)
    device, _ = upsert_device(db, user_id, payload)
    device.last_seen_at = seen_at
    device.last_sync_at = seen_at
    db.flush()
    return device
