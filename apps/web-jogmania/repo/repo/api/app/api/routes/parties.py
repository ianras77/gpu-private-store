import uuid

import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models import Party, PartyMember, World, WorldEvent, Route, Workout, GpsPoint
from app.schemas import (
    PartyCreate,
    PartyOut,
    PartyMemberCreate,
    PartyMemberOut,
    WorldOut,
    WorldEnter,
    WorldPlay,
    WorldEventOut
)
from app.services.fama_world import pick_world_name
from app.services.starter_content import ensure_user_baseline
from app.services.worlds import create_world_event, get_world_event_for_workout, resolve_workout_adventure

router = APIRouter(prefix="/parties", tags=["parties"])


def _party_or_404(db: Session, party_id: uuid.UUID, user_id):
    party = db.query(Party).filter(Party.id == party_id, Party.user_id == user_id).first()
    if not party:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party not found")
    return party


@router.get("", response_model=list[PartyOut])
def list_parties(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if ensure_user_baseline(db, user.id):
        db.commit()
    parties = db.query(Party).filter(Party.user_id == user.id).order_by(Party.created_at.desc()).all()
    return parties


@router.post("", response_model=PartyOut)
def create_party(payload: PartyCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    party = Party(user_id=user.id, name=payload.name)
    seed = random.randint(1000, 9999)
    world_name = payload.world_name or pick_world_name(seed)
    world_theme = payload.world_theme or "neon"
    world = World(party=party, name=world_name, theme=world_theme, seed=seed, state_json={})
    db.add(party)
    db.add(world)

    for member in payload.members:
        db.add(PartyMember(party=party, name=member.name, role=member.role))

    db.commit()
    db.refresh(party)
    return party


@router.get("/{party_id}", response_model=PartyOut)
def get_party(party_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    party = _party_or_404(db, party_id, user.id)
    return party


@router.post("/{party_id}/members", response_model=PartyMemberOut)
def add_party_member(
    party_id: uuid.UUID,
    payload: PartyMemberCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    party = _party_or_404(db, party_id, user.id)
    member = PartyMember(party_id=party.id, name=payload.name, role=payload.role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.post("/{party_id}/world/enter", response_model=WorldOut)
def enter_world(
    party_id: uuid.UUID,
    payload: WorldEnter,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    party = _party_or_404(db, party_id, user.id)
    world = party.world
    if not world:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="World not found")

    route = db.query(Route).filter(Route.id == payload.route_id, Route.user_id == user.id).first()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    if not route.is_course:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select an active course")

    world.route_id = route.id
    state = dict(world.state_json or {})
    state["course_id"] = str(route.id)
    world.state_json = state
    db.commit()
    db.refresh(world)
    return world


@router.get("/{party_id}/world/events", response_model=list[WorldEventOut])
def list_world_events(party_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    party = _party_or_404(db, party_id, user.id)
    world = party.world
    if not world:
        return []
    events = db.query(WorldEvent).filter(WorldEvent.world_id == world.id).order_by(desc(WorldEvent.created_at)).all()
    return events


@router.post("/{party_id}/world/play", response_model=WorldEventOut)
def play_world(
    party_id: uuid.UUID,
    payload: WorldPlay,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    party = _party_or_404(db, party_id, user.id)
    world = party.world
    if not world:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="World not found")
    if not world.route_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a course for this world first")

    workout = db.query(Workout).filter(Workout.id == payload.workout_id, Workout.user_id == user.id).first()
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    gps_points = (
        db.query(GpsPoint)
        .filter(GpsPoint.workout_id == workout.id)
        .order_by(GpsPoint.seq.asc())
        .all()
    )

    existing = get_world_event_for_workout(db, world.id, workout.id)
    if existing is not None:
        return existing

    route_instance, adventure = resolve_workout_adventure(db, workout.id)
    if route_instance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout route not found")
    if route_instance.route_id != world.route_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run does not match the active course")

    event = create_world_event(
        db,
        party=party,
        workout=workout,
        gps_points=gps_points,
        adventure_summary=adventure.summary_json if adventure else None,
    )
    db.commit()
    db.refresh(event)
    return event
