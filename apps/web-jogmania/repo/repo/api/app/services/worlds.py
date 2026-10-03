from __future__ import annotations

from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Adventure,
    GpsPoint,
    Party,
    PartyMember,
    RouteInstance,
    Workout,
    World,
    WorldEvent,
)
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


def parties_for_runner(db: Session, user_id) -> list[Party]:
    membership = db.query(PartyMember.party_id).filter(PartyMember.user_id == user_id)
    return db.query(Party).filter(
        or_(Party.user_id == user_id, Party.id.in_(membership))
    ).all()


def create_world_event(
    db: Session,
    *,
    party: Party,
    workout: Workout,
    gps_points: list[GpsPoint],
    adventure_summary: dict[str, Any] | None,
) -> WorldEvent:
    if party.world is None:
        raise ValueError("Party world not found")
    world = (
        db.query(World)
        .filter(World.id == party.world.id)
        .with_for_update()
        .populate_existing()
        .one()
    )

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
    state = dict(world.state_json or {})
    arcade = dict(state.get("arcade") or {})
    lights = list(arcade.get("lights") or [])
    light_names = ["the marquee", "the prize counter", "the lantern stage", "the pinball garden", "the roof sign"]
    run_number = int(arcade.get("runs", 0)) + 1
    chapter_number = (run_number - 1) // len(light_names)
    chapter_names = ["The Lost Arcade", "Moonlight Midway", "The Starry Boardwalk", "Sunrise Pier", "Cloudtop Carnival", "Jellybean Junction", "Lunar Lanes", "Twinkle Town"]
    chapter_base = chapter_names[chapter_number % len(chapter_names)]
    chapter = chapter_base if chapter_number < len(chapter_names) else f"{chapter_base} {chapter_number + 1}"
    next_chapter_number = run_number // len(light_names)
    next_chapter_base = chapter_names[next_chapter_number % len(chapter_names)]
    next_chapter = next_chapter_base if next_chapter_number < len(chapter_names) else f"{next_chapter_base} {next_chapter_number + 1}"
    lit_name = light_names[(run_number - 1) % len(light_names)]
    if chapter_number:
        lit_name = f"{chapter} · {lit_name}"
    if lit_name not in lights:
        lights.append(lit_name)
    chapter_lights = list(arcade.get("chapter_lights") or []) if arcade.get("chapter") == chapter else []
    if lit_name not in chapter_lights:
        chapter_lights.append(lit_name)
    arcade.update({
        "runs": run_number,
        "lights": lights,
        "chapter_lights": chapter_lights,
        "chapter": chapter,
        "last_light": lit_name,
        "next_surprise": f"{next_chapter} · {light_names[run_number % len(light_names)]}",
    })
    state["arcade"] = arcade
    world.state_json = state
    project = dict(arcade.get("project") or {})
    project_runs = int(project.get("runs", 0)) + 1
    project.update({
        "key": "grand-reopening",
        "title": "The Grand Reopening",
        "runs": project_runs,
        "target_runs": 12,
        "complete": project_runs >= 12,
        "message": "The crew is bringing this arcade back, one ordinary run at a time.",
    })
    arcade["project"] = project
    state["arcade"] = arcade
    world.state_json = state
    # Party history is shared, so retain the arcade outcome and remove per-run
    # distance/score details before writing a WorldEvent visible to the crew.
    payload_json.pop("score", None)
    shared_state = dict(payload_json.get("state") or {})
    shared_state.pop("course_id", None)
    shared_arcade = dict(shared_state.get("arcade") or {})
    shared_arcade.pop("last_workout_id", None)
    shared_state["arcade"] = shared_arcade
    payload_json["state"] = shared_state
    payload_json["shared_project"] = project
    payload_json["arcade_change"] = {
        "chapter": chapter,
        "light": lit_name,
        "lights": lights,
        "chapter_lights": chapter_lights,
        "runs": run_number,
        "project": project,
        "message": f"{lit_name.capitalize()} flickers back to life. The arcade grows brighter!",
    }
    event = WorldEvent(
        world_id=world.id,
        workout_id=workout.id,
        title=payload_json["arcade_change"]["message"],
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
    parties = parties_for_runner(db, user_id)

    events: list[WorldEvent] = []
    for party in parties:
        world = party.world
        if world is None:
            continue
        # A runner's arcade is shared across their courses. The selected route
        # sets the adventure, while every saved workout helps the world grow.
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
