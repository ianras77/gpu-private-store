from sqlalchemy.orm import Session

from app import models


def _normalize_user_id(user_id) -> str:
    return str(user_id)


def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()


def create_user(db: Session, email: str, hashed_password: str):
    user = models.User(email=email, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_courses(db: Session, user_id: str):
    user_id = _normalize_user_id(user_id)
    return (
        db.query(models.Course)
        .filter(models.Course.user_id == user_id)
        .order_by(models.Course.created_at.asc())
        .all()
    )


def get_course(db: Session, user_id: str, course_id: str):
    user_id = _normalize_user_id(user_id)
    return (
        db.query(models.Course)
        .filter(models.Course.user_id == user_id, models.Course.id == course_id)
        .first()
    )


def create_run(db: Session, user_id: str, run_in):
    user_id = _normalize_user_id(user_id)
    course = get_course(db, user_id, run_in.course_id)
    if not course:
        raise ValueError("Course not found")

    previous_best = course.best_pace_s_per_km
    improvement = None if previous_best is None else previous_best - run_in.avg_pace_s_per_km
    base_points = max(60, round(run_in.distance_m / 18 + getattr(run_in, "session_points", 0)))
    improvement_bonus = max(0, round((improvement or 0) * 2.5))
    earned_points = base_points + improvement_bonus

    run = models.Run(
        user_id=user_id,
        course_id=course.id,
        distance_m=run_in.distance_m,
        duration_s=run_in.duration_s,
        avg_pace_s_per_km=run_in.avg_pace_s_per_km,
        points=earned_points,
        improvement_s_per_km=improvement
    )
    db.add(run)
    db.flush()

    for ev in run_in.events:
        event = models.RunEvent(
            run_id=run.id,
            event_type=ev.type,
            ts_s=ev.ts_s,
            data=ev.data
        )
        db.add(event)

    course.last_pace_s_per_km = run_in.avg_pace_s_per_km
    if previous_best is None or run_in.avg_pace_s_per_km < previous_best:
        course.best_pace_s_per_km = run_in.avg_pace_s_per_km
    course.points = (course.points or 0) + earned_points

    db.commit()
    db.refresh(run)
    return run


def list_runs(db: Session, user_id: str, course_id: str | None = None):
    user_id = _normalize_user_id(user_id)
    query = db.query(models.Run).filter(models.Run.user_id == user_id)
    if course_id:
        query = query.filter(models.Run.course_id == course_id)
    return query.order_by(models.Run.created_at.desc()).all()


def get_run(db: Session, run_id: str, user_id: str):
    user_id = _normalize_user_id(user_id)
    return (
        db.query(models.Run)
        .filter(models.Run.id == run_id, models.Run.user_id == user_id)
        .first()
    )


def create_loot_items(db: Session, user_id: str, run_id: str | None, items: list[dict]):
    user_id = _normalize_user_id(user_id)
    loot_records = []
    for item in items:
        loot = models.LootItem(
            user_id=user_id,
            run_id=run_id,
            name=item["name"],
            rarity=item["rarity"],
            description=item["description"]
        )
        db.add(loot)
        loot_records.append(loot)
    db.commit()
    return loot_records
