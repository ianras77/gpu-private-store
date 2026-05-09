from datetime import datetime

from app import models


def build_export(run: models.Run) -> dict:
    return {
        "run_id": run.id,
        "user_id": run.user_id,
        "distance_m": run.distance_m,
        "duration_s": run.duration_s,
        "avg_pace_s_per_km": run.avg_pace_s_per_km,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "events": [
            {
                "type": ev.event_type,
                "ts_s": ev.ts_s,
                "data": ev.data
            }
            for ev in run.events
        ],
        "exported_at": datetime.utcnow().isoformat() + "Z"
    }
