from sqlalchemy.orm import Session

from app import models

DEFAULT_COURSES = [
    {
        "name": "Neon Canopy",
        "description": "Lantern vines and vine swings. Speed wins the jungle.",
        "distance_km": 3.4,
        "theme_key": "neon-canopy"
    },
    {
        "name": "Temple Steps",
        "description": "Stone stair climb with hidden relic drops.",
        "distance_km": 4.1,
        "theme_key": "temple-steps"
    },
    {
        "name": "Riverlight Loop",
        "description": "Fast loop with bright jumps and quick cash outs.",
        "distance_km": 2.7,
        "theme_key": "riverlight-loop"
    }
]


def ensure_default_courses(db: Session, user_id: str):
    courses = (
        db.query(models.Course)
        .filter(models.Course.user_id == user_id)
        .order_by(models.Course.created_at.asc())
        .all()
    )
    if courses:
        return courses

    created: list[models.Course] = []
    for entry in DEFAULT_COURSES:
        course = models.Course(
            user_id=user_id,
            name=entry["name"],
            description=entry["description"],
            distance_km=entry["distance_km"],
            theme_key=entry["theme_key"],
            points=0
        )
        db.add(course)
        created.append(course)

    db.commit()
    for course in created:
        db.refresh(course)
    return created
