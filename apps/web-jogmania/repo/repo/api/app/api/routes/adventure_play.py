from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import (
    AdventureSession,
    InventoryItem,
    Party,
    ProgressionLedgerEntry,
    Route,
    RunnerFeedback,
    RunnerProfile,
    World,
    WorldDecoration,
)
from app.schemas import (
    AdventureFeedbackCreate,
    AdventureSessionOut,
    CartridgeCreate,
    CartridgeOut,
    WorldDecorationOut,
    WorldDecorationPlace,
    RunnerPreferences,
    RunnerProfileOut,
    RunnerProfileUpdate,
)
from app.services.adventure_play import (
    _preferences,
    build_runner_snapshot,
    prepare_cartridge,
)
from app.services.progression import grant_inventory_item
from app.services.starter_content import ensure_user_baseline
from app.services.worlds import parties_for_runner

router = APIRouter(prefix="/adventure", tags=["adventure-play"])

DECORATION_CATALOG = {
    "lantern-arch": {"title": "Lantern arch", "icon": "🏮"},
    "prize-fox": {"title": "Prize fox", "icon": "🦊"},
    "star-bunting": {"title": "Star bunting", "icon": "⭐"},
    "flower-pot": {"title": "Moonflower pot", "icon": "🌼"},
    "neon-puddle": {"title": "Neon puddle", "icon": "💧"},
}
DECORATION_SLOTS = (
    "roof-left", "roof-center", "roof-right",
    "window-left", "window-right", "garden-left", "garden-center", "garden-right",
)


def _get_or_create_profile(db: Session, user_id) -> RunnerProfile:
    profile = db.query(RunnerProfile).filter(RunnerProfile.user_id == user_id).first()
    if profile is None:
        profile = RunnerProfile(user_id=user_id, preferences_json=RunnerPreferences().model_dump(), snapshot_json={})
        db.add(profile)
        db.flush()
    return profile


def _session_out(session: AdventureSession) -> AdventureSessionOut:
    return AdventureSessionOut(
        id=session.id,
        route_id=session.route_id,
        status=session.status,
        cartridge=session.cartridge_json or {},
        event_log=session.event_log_json or [],
        recap=session.recap_json or {},
        world_change=session.world_change_json or {},
        workout_id=session.workout_id,
        created_at=session.created_at,
    )


@router.get("/profile", response_model=RunnerProfileOut)
def get_runner_profile(db: Session = Depends(get_db), user=Depends(get_current_user)):
    ensure_user_baseline(db, user.id)
    profile = _get_or_create_profile(db, user.id)
    snapshot = build_runner_snapshot(db, user.id)
    profile.snapshot_json = snapshot
    db.commit()
    return RunnerProfileOut(preferences=_preferences(profile), snapshot=snapshot)


@router.put("/profile", response_model=RunnerProfileOut)
def update_runner_profile(
    payload: RunnerProfileUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    profile = _get_or_create_profile(db, user.id)
    current = _preferences(profile).model_dump()
    current.update(payload.model_dump(exclude_unset=True))
    profile.preferences_json = RunnerPreferences.model_validate(current).model_dump()
    profile.snapshot_json = build_runner_snapshot(db, user.id)
    db.commit()
    return RunnerProfileOut(preferences=_preferences(profile), snapshot=profile.snapshot_json or {})


@router.post("/cartridges", response_model=CartridgeOut, status_code=status.HTTP_201_CREATED)
async def create_cartridge(
    payload: CartridgeCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ensure_user_baseline(db, user.id)
    profile = _get_or_create_profile(db, user.id)
    route = None
    if payload.route_id:
        route = db.query(Route).filter(Route.id == payload.route_id, Route.user_id == user.id).first()
        if route is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    else:
        party = next(iter(sorted(parties_for_runner(db, user.id), key=lambda item: item.created_at)), None)
        if party and party.world and party.world.route_id:
            route = db.query(Route).filter(Route.id == party.world.route_id, Route.user_id == user.id).first()
        if route is None:
            route = db.query(Route).filter(Route.user_id == user.id, Route.is_course.is_(True)).order_by(Route.created_at.asc()).first()
    if route is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Choose a course before starting an adventure")
    session, cartridge = await prepare_cartridge(
        db,
        user_id=user.id,
        route=route,
        intent=payload.intent,
        profile=profile,
    )
    db.commit()
    return cartridge


@router.post("/sessions/{session_id}/feedback")
def save_adventure_feedback(
    session_id: uuid.UUID,
    payload: AdventureFeedbackCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    session = db.query(AdventureSession).filter(
        AdventureSession.id == session_id,
        AdventureSession.user_id == user.id,
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure session not found")
    feedback = db.query(RunnerFeedback).filter(RunnerFeedback.adventure_session_id == session.id).first()
    if feedback is None:
        feedback = RunnerFeedback(user_id=user.id, adventure_session_id=session.id, felt_personal=payload.felt_personal)
        db.add(feedback)
    feedback.felt_personal = payload.felt_personal
    feedback.style_correction = payload.style_correction
    profile = _get_or_create_profile(db, user.id)
    preferences = _preferences(profile).model_dump()
    preferences["story_feedback"] = payload.style_correction
    profile.preferences_json = preferences
    db.commit()
    return {"saved": True, "story_feedback": payload.style_correction}


@router.delete("/profile")
def clear_runner_memory(db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.query(RunnerFeedback).filter(RunnerFeedback.user_id == user.id).delete(synchronize_session=False)
    db.query(RunnerProfile).filter(RunnerProfile.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    return {"cleared": True}


@router.get("/sessions/{session_id}", response_model=AdventureSessionOut)
def get_adventure_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    session = db.query(AdventureSession).filter(
        AdventureSession.id == session_id,
        AdventureSession.user_id == user.id,
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure session not found")
    return _session_out(session)


@router.get("/world")
def get_adventure_world(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if ensure_user_baseline(db, user.id):
        db.commit()
    party = db.query(Party).filter(Party.user_id == user.id).order_by(Party.created_at.asc()).first()
    world = party.world if party else None
    if world is None:
        return {"name": "The Lost Arcade", "chapter": "Marquee Mystery", "arcade": {"lights": [], "runs": 0}}
    sessions = (
        db.query(AdventureSession)
        .filter(AdventureSession.user_id == user.id, AdventureSession.status == "complete")
        .order_by(AdventureSession.finished_at.desc())
        .limit(8)
        .all()
    )
    sparks = int(db.query(func.coalesce(func.sum(ProgressionLedgerEntry.sparks), 0)).filter(
        ProgressionLedgerEntry.user_id == user.id,
        ProgressionLedgerEntry.reason_code == "run-complete",
    ).scalar() or 0)
    level, level_sparks = divmod(sparks, 600)
    state = world.state_json or {}
    arcade = state.get("arcade") if isinstance(state.get("arcade"), dict) else {}
    decorations = db.query(WorldDecoration).filter(WorldDecoration.world_id == world.id).order_by(WorldDecoration.created_at.asc()).all()
    decoration_tokens = db.query(InventoryItem).filter(
        InventoryItem.user_id == user.id,
        InventoryItem.item_key == "arcade-decoration",
    ).first()
    return {
        "id": str(world.id),
        "name": world.name,
        "chapter": arcade.get("chapter", "Marquee Mystery"),
        "player_level": int(level) + 1,
        "sparks": sparks,
        "next_level_sparks": 600 - level_sparks,
        "theme": world.theme,
        "arcade": arcade,
        "decorations": [
            WorldDecorationOut(
                slot=item.slot,
                item_key=item.item_key,
                title=DECORATION_CATALOG.get(item.item_key, {}).get("title", "Arcade treasure"),
                icon=DECORATION_CATALOG.get(item.item_key, {}).get("icon", "✨"),
                owned_by_me=item.user_id == user.id,
                placed_at=item.created_at,
            ).model_dump(mode="json")
            for item in decorations
        ],
        "decoration_slots": list(DECORATION_SLOTS),
        "decoration_catalog": [{"key": key, **details} for key, details in DECORATION_CATALOG.items()],
        "decoration_tokens": decoration_tokens.quantity if decoration_tokens else 0,
        "recent_adventures": [_session_out(session).model_dump(mode="json") for session in sessions],
    }


@router.post("/world/decorations", response_model=WorldDecorationOut, status_code=status.HTTP_201_CREATED)
def place_world_decoration(
    payload: WorldDecorationPlace,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    party = db.query(Party).filter(Party.user_id == user.id).order_by(Party.created_at.asc()).first()
    if party is None or party.world is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your arcade is still finding its feet")
    world = db.query(World).filter(World.id == party.world.id).with_for_update().one()
    occupied = db.query(WorldDecoration).filter(
        WorldDecoration.world_id == world.id,
        WorldDecoration.slot == payload.slot,
    ).first()
    if occupied:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That little spot already has a decoration")
    item = db.query(InventoryItem).filter(
        InventoryItem.user_id == user.id,
        InventoryItem.item_key == "arcade-decoration",
    ).with_for_update().first()
    if item is None or item.quantity < 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Finish more adventures to earn a decoration token")
    item.quantity -= 1
    decoration = WorldDecoration(
        world_id=world.id,
        user_id=user.id,
        item_key=payload.item_key,
        slot=payload.slot,
    )
    db.add(decoration)
    db.commit()
    db.refresh(decoration)
    details = DECORATION_CATALOG[payload.item_key]
    return WorldDecorationOut(
        slot=decoration.slot,
        item_key=decoration.item_key,
        title=details["title"],
        icon=details["icon"],
        owned_by_me=True,
        placed_at=decoration.created_at,
    )


@router.delete("/world/decorations/{slot}")
def remove_world_decoration(
    slot: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if slot not in DECORATION_SLOTS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decoration spot not found")
    party = db.query(Party).filter(Party.user_id == user.id).order_by(Party.created_at.asc()).first()
    if party is None or party.world is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arcade not found")
    world = db.query(World).filter(World.id == party.world.id).with_for_update().one()
    decoration = db.query(WorldDecoration).filter(
        WorldDecoration.world_id == world.id,
        WorldDecoration.slot == slot,
    ).first()
    if decoration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No decoration is in that spot")
    if decoration.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only its decorator can move this keepsake")
    db.delete(decoration)
    grant_inventory_item(db, user.id, "arcade-decoration", 1)
    db.commit()
    return {"removed": True, "returned_tokens": 1}
