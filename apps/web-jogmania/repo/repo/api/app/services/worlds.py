from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Adventure, GpsPoint, Party, RouteInstance, Workout, WorldEvent
from app.services.dungeon_master import play_session


def _gps_payload(points: list[GpsPoint]) -> list[dict[str, Any]]:
    return [
        {
            "lat": point.lat,
            "lon": point.lon,
            "timestamp": point.timestamp,
        }
        for point in points
    ]


def get_world_event_for_workout(db: Session, world_id, workout_id) -> WorldEvent | None:
    return (
        db.query(WorldEvent)
        .filter(WorldEvent.world_id == world_id, WorldEvent.workout_id == workout_id)
        .first()
    )


def create_world_event(
    db: Session,
    *,
    party: Party,
    workout: Workout,
    gps_points: list[GpsPoint],
    adventure_summary: dict[str, Any] | None,
) -> WorldEvent:
    world = party.world
    if world is None:
        raise ValueError("Party world not found")

    existing = get_world_event_for_workout(db, world.id, workout.id)
    if existing is not None:
        return existing

    payload_json = play_session(
        {
            "name": party.name,
            "members": [{"name": member.name, "role": member.role} for member in party.members],
        },
        {
            "seed": world.seed,
            "name": world.name,
            "theme": world.theme,
            "state_json": world.state_json,
        },
        {
            "id": str(workout.id),
            "distance_m": workout.distance_m,
        },
        _gps_payload(gps_points),
        adventure_summary,
    )

    world.state_json = payload_json.get("state", world.state_json)
    event = WorldEvent(
        world_id=world.id,
        workout_id=workout.id,
        title=payload_json.get("title", "World Session"),
        payload_json=payload_json,
    )
    db.add(event)
    db.flush()
    return event


def autoplay_worlds_for_workout(
    db: Session,
    *,
    user_id,
    route_instance: RouteInstance,
    workout: Workout,
    gps_points: list[GpsPoint],
    adventure_summary: dict[str, Any] | None,
) -> list[WorldEvent]:
    parties = (
        db.query(Party)
        .filter(Party.user_id == user_id)
        .all()
    )

    events: list[WorldEvent] = []
    for party in parties:
        world = party.world
        if world is None or world.route_id != route_instance.route_id:
            continue
        events.append(
            create_world_event(
                db,
                party=party,
                workout=workout,
                gps_points=gps_points,
                adventure_summary=adventure_summary,
            )
        )
    return events


def resolve_workout_adventure(db: Session, workout_id) -> tuple[RouteInstance | None, Adventure | None]:
    route_instance = db.query(RouteInstance).filter(RouteInstance.workout_id == workout_id).first()
    if route_instance is None:
        return None, None
    adventure = db.query(Adventure).filter(Adventure.route_instance_id == route_instance.id).first()
    return route_instance, adventure
