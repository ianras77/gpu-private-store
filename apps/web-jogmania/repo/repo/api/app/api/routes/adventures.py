import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models import Adventure, RouteInstance, Workout, Route

router = APIRouter(prefix="/adventures", tags=["adventures"])


@router.get("/by-workout/{workout_id}")
def adventure_by_workout(workout_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == user.id).first()
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    instance = db.query(RouteInstance).filter(RouteInstance.workout_id == workout.id).first()
    if not instance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route instance not found")

    adventure = db.query(Adventure).filter(Adventure.route_instance_id == instance.id).first()
    if not adventure:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure not found")

    return adventure.summary_json


@router.get("/by-route/{route_id}")
def adventure_by_route(route_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    route = db.query(Route).filter(Route.id == route_id, Route.user_id == user.id).first()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    instances = db.query(RouteInstance).filter(RouteInstance.route_id == route.id).all()
    if not instances:
        return []

    instance_ids = [inst.id for inst in instances]
    adventures = db.query(Adventure).filter(Adventure.route_instance_id.in_(instance_ids)).all()
    return [adv.summary_json for adv in adventures]
