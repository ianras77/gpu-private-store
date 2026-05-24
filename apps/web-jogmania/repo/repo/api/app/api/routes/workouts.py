import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models import Workout, GpsPoint, RouteInstance, Adventure, Route
from app.schemas import DeviceRegister, WorkoutCreate, WorkoutOut, WorkoutDetail
from app.services.route_detector import detect_or_create_route
from app.services.adventure_generator import build_adventure
from app.services.devices import touch_device_sync, upsert_device
from app.services.progression import award_workout_progress
from app.services.starter_content import ensure_user_baseline
from app.services.worlds import autoplay_worlds_for_workout

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _difficulty(avg_pace_s_per_km: float, elevation_gain_m: float | None) -> int:
    pace_factor = max(1.0, min(4.0, avg_pace_s_per_km / 360.0))
    elev_factor = min(4.0, (elevation_gain_m or 0) / 150.0)
    return int(min(10, 1 + pace_factor + elev_factor))


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
        db.commit()
        existing_points = (
            db.query(GpsPoint)
            .filter(GpsPoint.workout_id == existing_workout.id)
            .order_by(GpsPoint.seq.asc())
            .all()
        )
        existing_route_instance = (
            db.query(RouteInstance)
            .filter(RouteInstance.workout_id == existing_workout.id)
            .first()
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
    raw_payload = dict(payload.raw_payload_json or {})
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
