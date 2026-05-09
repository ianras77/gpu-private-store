import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models import Workout, GpsPoint
from app.services.storage import upload_workout_export, StorageNotConfigured, StorageUnavailable

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/workout/{workout_id}")
def export_workout(workout_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(get_current_user)):
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == user.id).first()
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")

    gps_points = db.query(GpsPoint).filter(GpsPoint.workout_id == workout.id).order_by(GpsPoint.seq.asc()).all()
    payload = {
        "workout": {
            "id": str(workout.id),
            "source": workout.source,
            "started_at": workout.started_at.isoformat(),
            "ended_at": workout.ended_at.isoformat(),
            "duration_s": workout.duration_s,
            "distance_m": workout.distance_m,
            "avg_pace_s_per_km": workout.avg_pace_s_per_km,
            "calories_kcal": workout.calories_kcal,
            "avg_hr": workout.avg_hr,
            "elevation_gain_m": workout.elevation_gain_m
        },
        "gps_points": [
            {
                "lat": p.lat,
                "lon": p.lon,
                "altitude_m": p.altitude_m,
                "timestamp": p.timestamp.isoformat(),
                "accuracy_m": p.accuracy_m
            } for p in gps_points
        ]
    }

    try:
        url = upload_workout_export(str(workout.id), payload)
        return {"url": url}
    except StorageNotConfigured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Export storage not configured. Set MINIO_* or disable exports."
        )
    except StorageUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Export storage unavailable. Try again later."
        )
