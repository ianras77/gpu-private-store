import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.core.config import settings
from app.models import (
    Adventure,
    AdventureSession,
    GpsPoint,
    Route,
    RouteInstance,
    StoryJob,
    Workout,
)
from app.schemas import DeviceRegister, WorkoutCreate, WorkoutDetail, WorkoutOut
from app.services.adventure_generator import build_adventure
from app.services.adventure_play import build_recap, recover_offline_session
from app.services.devices import touch_device_sync, upsert_device
from app.services.progression import award_workout_progress
from app.services.route_detector import detect_or_create_route
from app.services.starter_content import ensure_user_baseline
from app.services.worlds import autoplay_worlds_for_workout, parties_for_runner

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _difficulty(_avg_pace_s_per_km: float, elevation_gain_m: float | None) -> int:
    # Keep the legacy field stable without turning speed into a challenge rating.
    route_shape = min(4.0, max(0.0, elevation_gain_m or 0) / 150.0)
    return int(min(10, 1 + route_shape))


def _serialize_workout_detail(workout: Workout, gps_points: list[GpsPoint], route_id) -> WorkoutDetail:
    return WorkoutDetail(
        **WorkoutOut.model_validate(workout).model_dump(),
        gps_points=[
            {
                "id": str(point.id),
                "seq": point.seq,
                "lat": point.lat,
                "lon": point.lon,
                "altitude_m": point.altitude_m,
                "timestamp": point.timestamp,
                "accuracy_m": point.accuracy_m,
            }
            for point in gps_points
        ],
        route_id=str(route_id) if route_id else None,
    )


def _find_duplicate_workout(db: Session, payload: WorkoutCreate, user_id):
    return (
        db.query(Workout)
        .filter(
            Workout.user_id == user_id,
            Workout.source == payload.source,
            Workout.started_at == payload.started_at,
            Workout.ended_at == payload.ended_at,
        )
        .first()
    )


def _device_from_workout(payload: WorkoutCreate) -> DeviceRegister | None:
    if payload.device:
        return payload.device

    raw_payload = payload.raw_payload_json or {}
    device_id = payload.device_id or raw_payload.get("device_id")
    if not isinstance(device_id, str) or not device_id.strip():
        return None

    companion_device_id = raw_payload.get("companion_device_id")
    if not isinstance(companion_device_id, str):
        companion_device_id = None

    default_name = None
    if payload.source == "ios":
        default_name = "Jogmania iPhone"
    elif payload.source == "watch":
        default_name = "Jogmania Apple Watch"

    metadata = {
        key: value
        for key, value in raw_payload.items()
        if key in {"capture_mode", "synced_via"} and value is not None
    } or None

    return DeviceRegister(
        platform=payload.source,
        device_id=device_id,
        name=default_name,
        companion_device_id=companion_device_id,
        metadata_json=metadata
    )


def _link_adventure_session(db: Session, raw_payload: dict, user_id, route: Route, workout: Workout):
    raw_id = raw_payload.get("adventure_session_id")
    if not raw_id:
        return None
    try:
        session_id = uuid.UUID(str(raw_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid adventure session id")
    session = db.query(AdventureSession).filter(
        AdventureSession.id == session_id,
        AdventureSession.user_id == user_id,
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure session not found")
    if session.route_id and session.route_id != route.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Adventure course does not match this run")
    if session.workout_id and session.workout_id != workout.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Adventure session is already linked to another run")

    event_seeds = {
        str(event.get("id")): event
        for event in (session.cartridge_json or {}).get("events", [])
        if isinstance(event, dict) and event.get("id")
    }
    event_log = []
    for item in (raw_payload.get("adventure_events") or [])[:24]:
        if not isinstance(item, dict):
            continue
        event_id = str(item.get("id", ""))
        seed = event_seeds.get(event_id)
        if seed and event_id not in {entry["id"] for entry in event_log}:
            event_log.append({"id": event_id, "title": seed.get("title", "A moment"), "kind": seed.get("kind", "discovery")})
    session.route_id = route.id
    session.workout_id = workout.id
    session.status = "complete"
    session.started_at = workout.started_at
    session.finished_at = workout.ended_at
    session.event_log_json = event_log
    return session


@router.post("", response_model=WorkoutDetail)
async def create_workout(payload: WorkoutCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ensure_user_baseline(db, user.id)

    device_payload = _device_from_workout(payload)
    if device_payload:
        device, _ = upsert_device(db, user.id, device_payload)
        device.last_seen_at = payload.ended_at
        device.last_sync_at = payload.ended_at

    existing_workout = _find_duplicate_workout(db, payload, user.id)
    if existing_workout is not None:
        existing_route_instance = (
            db.query(RouteInstance)
            .filter(RouteInstance.workout_id == existing_workout.id)
            .first()
        )
        if existing_route_instance:
            existing_route = db.query(Route).filter(Route.id == existing_route_instance.route_id).first()
            if existing_route:
                linked_session = _link_adventure_session(
                    db,
                    dict(payload.raw_payload_json or {}),
                    user.id,
                    existing_route,
                    existing_workout,
                )
                if linked_session is None:
                    linked_session = recover_offline_session(
                        db,
                        user_id=user.id,
                        route=existing_route,
                        workout=existing_workout,
                        event_log=(payload.raw_payload_json or {}).get("adventure_events"),
                    )
                    existing_payload = dict(existing_workout.raw_payload_json or {})
                    existing_payload["adventure_session_id"] = str(linked_session.id)
                    existing_workout.raw_payload_json = existing_payload
                if linked_session and not linked_session.recap_json:
                    linked_session.recap_json = await build_recap(
                        db,
                        session=linked_session,
                        workout=existing_workout,
                        route=existing_route,
                        event_log=linked_session.event_log_json or [],
                        use_mastra=False,
                    )
                    existing_payload = dict(existing_workout.raw_payload_json or {})
                    existing_payload["adventure_recap"] = linked_session.recap_json
                    existing_workout.raw_payload_json = existing_payload
                    if settings.mastra_url and settings.mastra_internal_token and not db.query(StoryJob).filter(
                        StoryJob.adventure_session_id == linked_session.id,
                        StoryJob.job_type == "recap",
                    ).first():
                        db.add(StoryJob(user_id=user.id, adventure_session_id=linked_session.id))
        db.commit()
        existing_points = (
            db.query(GpsPoint)
            .filter(GpsPoint.workout_id == existing_workout.id)
            .order_by(GpsPoint.seq.asc())
            .all()
        )
        return _serialize_workout_detail(
            existing_workout,
            existing_points,
            existing_route_instance.route_id if existing_route_instance else None,
        )

    workout = Workout(
        user_id=user.id,
        source=payload.source,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_s=payload.duration_s,
        distance_m=payload.distance_m,
        avg_pace_s_per_km=payload.avg_pace_s_per_km,
        calories_kcal=payload.calories_kcal,
        avg_hr=payload.avg_hr,
        elevation_gain_m=payload.elevation_gain_m,
        raw_payload_json=payload.raw_payload_json
    )
    db.add(workout)
    db.flush()

    gps_points = []
    for idx, point in enumerate(payload.gps_points):
        gps_points.append(GpsPoint(
            workout_id=workout.id,
            seq=idx,
            lat=point.lat,
            lon=point.lon,
            altitude_m=point.altitude_m,
            timestamp=point.timestamp,
            accuracy_m=point.accuracy_m
        ))
    db.add_all(gps_points)
    db.flush()

    if payload.route_id:
        route = db.query(Route).filter(Route.id == payload.route_id, Route.user_id == user.id).first()
        if route is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    else:
        points = [(p.lat, p.lon) for p in gps_points]
        route = detect_or_create_route(db, user.id, points)

    raw_payload = dict(payload.raw_payload_json or {})
    adventure_session = _link_adventure_session(db, raw_payload, user.id, route, workout)
    if adventure_session is None:
        adventure_session = recover_offline_session(
            db,
            user_id=user.id,
            route=route,
            workout=workout,
            event_log=raw_payload.get("adventure_events"),
        )
        raw_payload["adventure_session_id"] = str(adventure_session.id)

    seed = int(workout.id.int % 100000)
    difficulty = _difficulty(workout.avg_pace_s_per_km, workout.elevation_gain_m)

    route_instance = RouteInstance(
        route_id=route.id,
        workout_id=workout.id,
        instance_seed=seed,
        difficulty=difficulty
    )
    db.add(route_instance)
    db.flush()

    adventure_summary = await build_adventure(
        points=[{
            "lat": p.lat,
            "lon": p.lon,
            "altitude_m": p.altitude_m,
            "timestamp": p.timestamp,
            "accuracy_m": p.accuracy_m,
        } for p in gps_points],
        workout={
            "distance_m": workout.distance_m,
            "avg_hr": workout.avg_hr,
            "calories_kcal": workout.calories_kcal,
            "elevation_gain_m": workout.elevation_gain_m,
            "raw_payload_json": workout.raw_payload_json,
        },
        seed=seed
    )

    adventure = Adventure(route_instance_id=route_instance.id, summary_json=adventure_summary)
    db.add(adventure)
    progression = award_workout_progress(db, user.id, workout, route, adventure_summary)
    if payload.device_id:
        raw_payload["device_id"] = payload.device_id
    raw_payload["progression"] = progression
    world_events = autoplay_worlds_for_workout(
        db,
        user_id=user.id,
        route_instance=route_instance,
        workout=workout,
        gps_points=gps_points,
        adventure_summary=adventure_summary,
    )
    if world_events:
        raw_payload["world_events"] = [
            {
                "id": str(event.id),
                "title": event.title,
                "world_id": str(event.world_id),
            }
            for event in world_events
        ]
    if adventure_session:
        matching_party = parties_for_runner(db, user.id)
        event_world_ids = {event.world_id for event in world_events}
        matching_world = next((party.world for party in matching_party if party.world and party.world.id in event_world_ids), None)
        adventure_session.world_change_json = {
            "title": world_events[0].title if world_events else "A little more of the world lit up",
            "arcade": (matching_world.state_json or {}).get("arcade", {}) if matching_world else {},
        }
        raw_payload["adventure_world_change"] = adventure_session.world_change_json
        adventure_session.recap_json = await build_recap(
            db,
            session=adventure_session,
            workout=workout,
            route=route,
            event_log=adventure_session.event_log_json or [],
            use_mastra=False,
        )
        raw_payload["adventure_recap"] = adventure_session.recap_json
        if settings.mastra_url and settings.mastra_internal_token:
            db.add(StoryJob(user_id=user.id, adventure_session_id=adventure_session.id))
    workout.raw_payload_json = raw_payload
    if payload.device_id:
        touch_device_sync(
            db,
            user.id,
            platform=payload.source,
            device_id=payload.device_id,
            seen_at=payload.ended_at,
        )
    db.commit()
    db.refresh(workout)

    return _serialize_workout_detail(workout, gps_points, route.id)


@router.get("", response_model=list[WorkoutOut])
def list_workouts(db: Session = Depends(get_db), user=Depends(get_current_user)):
    workouts = (
        db.query(Workout)
        .filter(Workout.user_id == user.id)
        .order_by(Workout.started_at.desc())
        .all()
    )
    return workouts


@router.get("/{workout_id}", response_model=WorkoutDetail)
def get_workout(workout_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == user.id).first()
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    gps_points = (
        db.query(GpsPoint)
        .filter(GpsPoint.workout_id == workout.id)
        .order_by(GpsPoint.seq.asc())
        .all()
    )

    route_instance = (
        db.query(RouteInstance)
        .filter(RouteInstance.workout_id == workout.id)
        .first()
    )

    return _serialize_workout_detail(workout, gps_points, route_instance.route_id if route_instance else None)
