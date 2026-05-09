import random
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.auth import hash_password
from app.services.courses import ensure_default_courses


DEMO_EMAIL = "demo@jogmania.com"
DEMO_PASSWORD = "demo1234"


def seed_demo_data(db: Session):
    user = crud.get_user_by_email(db, DEMO_EMAIL)
    if not user:
        user = crud.create_user(db, DEMO_EMAIL, hash_password(DEMO_PASSWORD))

    courses = ensure_default_courses(db, user.id)
    existing_runs = db.query(models.Run).filter(models.Run.user_id == user.id).count()
    if existing_runs > 0:
        return user

    if not courses:
        return user

    for index in range(3):
        course = courses[index % len(courses)]
        distance = random.randint(600, 1800)
        duration = random.randint(240, 900)
        avg_pace = int(duration / (distance / 1000))
        payload = schemas.RunCreate(
            course_id=course.id,
            distance_m=distance,
            duration_s=duration,
            avg_pace_s_per_km=avg_pace,
            session_points=random.randint(30, 120),
            events=[schemas.RunEventIn(type="relic", ts_s=i * 30, data={"combo": i + 1}) for i in range(5)]
        )
        crud.create_run(db, user.id, payload)

    return user
