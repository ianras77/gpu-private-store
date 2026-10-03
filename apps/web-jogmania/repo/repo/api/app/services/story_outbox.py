from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models import AdventureSession, Route, StoryJob, Workout
from app.services.adventure_play import build_recap

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 8


async def process_story_job_batch(db: Session, limit: int = 4) -> int:
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=10)
    db.query(StoryJob).filter(
        StoryJob.status == "processing",
        StoryJob.updated_at < stale_before,
    ).update(
        {
            StoryJob.status: "pending",
            StoryJob.next_attempt_at: now,
            StoryJob.last_error: "Worker restarted; retrying the saved postcard",
        },
        synchronize_session=False,
    )
    jobs = (
        db.query(StoryJob)
        .filter(StoryJob.status == "pending", StoryJob.next_attempt_at <= now)
        .order_by(StoryJob.created_at.asc())
        .with_for_update(skip_locked=True)
        .limit(limit)
        .all()
    )
    for job in jobs:
        job.status = "processing"
        job.attempts += 1
    if jobs:
        db.commit()

    completed = 0
    for job in jobs:
        session = db.query(AdventureSession).filter(AdventureSession.id == job.adventure_session_id).first()
        workout = db.query(Workout).filter(Workout.id == session.workout_id).first() if session and session.workout_id else None
        route = db.query(Route).filter(Route.id == session.route_id).first() if session and session.route_id else None
        if not session or not workout or not route:
            job.status = "fallback"
            job.last_error = "Run story source is unavailable"
            db.commit()
            continue

        try:
            recap = await build_recap(
                db,
                session=session,
                workout=workout,
                route=route,
                event_log=session.event_log_json or [],
            )
            if recap.get("intelligence") == "mastra":
                session.recap_json = recap
                raw_payload = dict(workout.raw_payload_json or {})
                raw_payload["adventure_recap"] = recap
                workout.raw_payload_json = raw_payload
                job.status = "complete"
                job.last_error = None
                completed += 1
            elif job.attempts >= MAX_ATTEMPTS:
                job.status = "fallback"
                job.last_error = "Mastra enrichment unavailable; deterministic postcard retained"
            else:
                job.status = "pending"
                job.next_attempt_at = now + timedelta(seconds=min(300, 15 * (2 ** (job.attempts - 1))))
                job.last_error = "Mastra enrichment unavailable; retry scheduled"
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Jogmania story enrichment job failed")
            failed_job = db.query(StoryJob).filter(StoryJob.id == job.id).first()
            if failed_job:
                failed_job.status = "fallback" if failed_job.attempts >= MAX_ATTEMPTS else "pending"
                failed_job.next_attempt_at = now + timedelta(seconds=min(300, 15 * (2 ** min(failed_job.attempts, 5))))
                failed_job.last_error = "Mastra enrichment error; deterministic postcard retained"
                db.commit()
    return completed


async def story_outbox_loop() -> None:
    while True:
        db = SessionLocal()
        try:
            await process_story_job_batch(db)
        except Exception:
            db.rollback()
            logger.exception("Jogmania story outbox cycle failed")
        finally:
            db.close()
        await asyncio.sleep(10)
