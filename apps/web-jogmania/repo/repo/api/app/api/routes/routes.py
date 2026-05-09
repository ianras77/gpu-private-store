import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models import Route, RouteInstance, Workout
from app.schemas import RouteOut, RouteDetail, RenameRoute, RouteInstanceOut, WorkoutOut
from app.services.starter_content import ensure_user_baseline

router = APIRouter(prefix="/routes", tags=["routes"])


def _route_stats(db: Session, route_id):
    instances = db.query(RouteInstance).filter(RouteInstance.route_id == route_id).all()
    if not instances:
        return {"frequency": 0, "distance_m": None, "typical_pace_s_per_km": None, "last_run_at": None}
    workout_ids = [inst.workout_id for inst in instances]
    workouts = db.query(Workout).filter(Workout.id.in_(workout_ids)).all()
    if not workouts:
        return {"frequency": len(instances), "distance_m": None, "typical_pace_s_per_km": None, "last_run_at": None}
    distance_avg = sum(w.distance_m for w in workouts) / len(workouts)
    pace_avg = sum(w.avg_pace_s_per_km for w in workouts) / len(workouts)
    last_run_at = max(w.started_at for w in workouts)
    return {
        "frequency": len(instances),
        "distance_m": distance_avg,
        "typical_pace_s_per_km": pace_avg,
        "last_run_at": last_run_at
    }


@router.get("", response_model=list[RouteOut])
def list_routes(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if ensure_user_baseline(db, user.id):
        db.commit()
    routes = db.query(Route).filter(Route.user_id == user.id).order_by(Route.created_at.desc()).all()
    output = []
    for route in routes:
        stats = _route_stats(db, route.id)
        output.append(RouteOut(
            id=str(route.id),
            name=route.name,
            route_hash=route.route_hash,
            created_at=route.created_at,
            is_course=route.is_course,
            distance_m=stats["distance_m"],
            typical_pace_s_per_km=stats["typical_pace_s_per_km"],
            frequency=stats["frequency"],
            last_run_at=stats["last_run_at"]
        ))
    return output


@router.get("/{route_id}", response_model=RouteDetail)
def get_route(route_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    route = db.query(Route).filter(Route.id == route_id, Route.user_id == user.id).first()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    instances = db.query(RouteInstance).filter(RouteInstance.route_id == route.id).order_by(RouteInstance.created_at.desc()).all()
    workout_ids = [inst.workout_id for inst in instances]
    workouts = db.query(Workout).filter(Workout.id.in_(workout_ids)).order_by(Workout.started_at.desc()).all() if workout_ids else []
    stats = _route_stats(db, route.id)

    return RouteDetail(
        id=str(route.id),
        name=route.name,
        route_hash=route.route_hash,
        created_at=route.created_at,
        is_course=route.is_course,
        distance_m=stats["distance_m"],
        typical_pace_s_per_km=stats["typical_pace_s_per_km"],
        frequency=stats["frequency"],
        last_run_at=stats["last_run_at"],
        instances=[RouteInstanceOut.model_validate(inst) for inst in instances],
        workouts=[WorkoutOut.model_validate(w) for w in workouts]
    )


@router.post("/{route_id}/rename", response_model=RouteOut)
def rename_route(route_id: uuid.UUID, payload: RenameRoute, db: Session = Depends(get_db), user=Depends(get_current_user)):
    route = db.query(Route).filter(Route.id == route_id, Route.user_id == user.id).first()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    route.name = payload.name
    db.commit()
    db.refresh(route)
    stats = _route_stats(db, route.id)
    return RouteOut(
        id=str(route.id),
        name=route.name,
        route_hash=route.route_hash,
        created_at=route.created_at,
        is_course=route.is_course,
        distance_m=stats["distance_m"],
        typical_pace_s_per_km=stats["typical_pace_s_per_km"],
        frequency=stats["frequency"],
        last_run_at=stats["last_run_at"]
    )


@router.post("/{route_id}/activate", response_model=RouteOut)
def activate_route(route_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    route = db.query(Route).filter(Route.id == route_id, Route.user_id == user.id).first()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    route.is_course = True
    db.commit()
    db.refresh(route)
    stats = _route_stats(db, route.id)
    return RouteOut(
        id=str(route.id),
        name=route.name,
        route_hash=route.route_hash,
        created_at=route.created_at,
        is_course=route.is_course,
        distance_m=stats["distance_m"],
        typical_pace_s_per_km=stats["typical_pace_s_per_km"],
        frequency=stats["frequency"],
        last_run_at=stats["last_run_at"]
    )
