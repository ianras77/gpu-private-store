from __future__ import annotations

from math import ceil
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    InventoryItem,
    ProgressionLedgerEntry,
    Reward,
    RouteInstance,
    Workout,
)
from app.services.course_story import chapter_for_visit

LEDGER_VERSION = 1
SPARKS_PER_LEVEL = 600


def _record_ledger(db: Session, user_id, workout: Workout, reason_code: str, *, sparks: int = 0, payload: dict[str, Any] | None = None) -> None:
    db.add(ProgressionLedgerEntry(
        user_id=user_id,
        workout_id=workout.id,
        ledger_version=LEDGER_VERSION,
        reason_code=reason_code,
        sparks=sparks,
        payload_json=payload or {},
    ))


def grant_inventory_item(db: Session, user_id, item_key: str, quantity: int = 1) -> InventoryItem:
    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.user_id == user_id, InventoryItem.item_key == item_key)
        .first()
    )
    if item is None:
        item = InventoryItem(user_id=user_id, item_key=item_key, quantity=max(0, quantity))
        db.add(item)
    else:
        item.quantity = max(0, item.quantity + quantity)
    db.flush()
    return item


def grant_reward(
    db: Session,
    user_id,
    reward_type: str,
    *,
    label: str,
    summary: str,
    extra_payload: dict[str, Any] | None = None
) -> Reward:
    payload = {"label": label, "summary": summary}
    if extra_payload:
        payload.update(extra_payload)
    reward = Reward(user_id=user_id, type=reward_type, payload_json=payload)
    db.add(reward)
    db.flush()
    return reward


def ensure_starter_pack(db: Session, user_id) -> bool:
    existing = (
        db.query(Reward)
        .filter(Reward.user_id == user_id, Reward.type == "starter-pack")
        .first()
    )
    if existing:
        decoration_credit = db.query(InventoryItem).filter(
            InventoryItem.user_id == user_id,
            InventoryItem.item_key == "arcade-decoration",
        ).first()
        if decoration_credit is None:
            grant_inventory_item(db, user_id, "arcade-decoration", 1)
            return True
        return False

    grant_reward(
        db,
        user_id,
        "starter-pack",
        label="Starter Pack",
        summary="Your first arcade loadout is ready. Start running to unlock new course relics."
    )
    grant_inventory_item(db, user_id, "arcade-token", 5)
    grant_inventory_item(db, user_id, "glow-band", 1)
    grant_inventory_item(db, user_id, "arcade-decoration", 1)
    return True


def _route_history(db: Session, route_id, workout_id) -> list[Workout]:
    return (
        db.query(Workout)
        .join(RouteInstance, RouteInstance.workout_id == Workout.id)
        .filter(RouteInstance.route_id == route_id, Workout.id != workout_id)
        .order_by(Workout.started_at.asc())
        .all()
    )


def compute_run_points(
    distance_m: float,
) -> int:
    # Pace, heart rate, device, and simulated combat never decide whether the runner
    # deserves a reward. Sparks simply record the adventure they chose to take.
    return max(60, round(max(0.0, distance_m) / 18))


def award_workout_progress(db: Session, user_id, workout: Workout, route, adventure_summary: dict[str, Any]) -> dict[str, Any]:
    existing_award = db.query(ProgressionLedgerEntry).filter(
        ProgressionLedgerEntry.user_id == user_id,
        ProgressionLedgerEntry.workout_id == workout.id,
        ProgressionLedgerEntry.reason_code == "run-complete",
    ).first()
    if existing_award:
        saved = (workout.raw_payload_json or {}).get("progression", {})
        return saved if isinstance(saved, dict) else {"points": existing_award.sparks, "rewards": [], "inventory": {}}
    previous_runs = _route_history(db, route.id, workout.id)
    prior_sparks = int(db.query(func.coalesce(func.sum(ProgressionLedgerEntry.sparks), 0)).filter(
        ProgressionLedgerEntry.user_id == user_id,
        ProgressionLedgerEntry.reason_code == "run-complete",
    ).scalar() or 0)
    run_points = compute_run_points(workout.distance_m)
    previous_level = prior_sparks // SPARKS_PER_LEVEL + 1
    new_level = (prior_sparks + run_points) // SPARKS_PER_LEVEL + 1
    token_gain = max(1, min(5, ceil(run_points / 160)))
    rewards_earned: list[str] = []
    inventory_earned: dict[str, int] = {"arcade-token": token_gain}

    grant_reward(
        db,
        user_id,
        "run-complete",
        label=f"{route.name} Cleared",
        summary=f"You showed up for {round(workout.distance_m / 1000, 2)} km of adventure and earned {run_points} arcade sparks.",
        extra_payload={
            "points": run_points,
            "route_id": str(route.id),
            "workout_id": str(workout.id),
            "source": workout.source,
        }
    )
    rewards_earned.append("run-complete")
    _record_ledger(db, user_id, workout, "run-complete", sparks=run_points, payload={"points_formula_version": LEDGER_VERSION})
    grant_inventory_item(db, user_id, "arcade-token", token_gain)

    if new_level > previous_level:
        grant_reward(
            db,
            user_id,
            "arcade-level-up",
            label=f"Arcade Level {new_level}",
            summary="Your little arcade has a brand-new corner. Every spark came from a run you chose to take.",
            extra_payload={"from_level": previous_level, "level": new_level, "workout_id": str(workout.id)},
        )
        grant_inventory_item(db, user_id, "arcade-decoration", 1)
        rewards_earned.append("arcade-level-up")
        inventory_earned["arcade-decoration"] = inventory_earned.get("arcade-decoration", 0) + 1
        _record_ledger(
            db,
            user_id,
            workout,
            "arcade-level-up",
            payload={"from_level": previous_level, "level": new_level},
        )

    if not previous_runs:
        grant_reward(
            db,
            user_id,
            "course-discovered",
            label="Course Discovered",
            summary=f"{route.name} is now part of your adventure deck.",
            extra_payload={"route_id": str(route.id), "workout_id": str(workout.id)}
        )
        grant_inventory_item(db, user_id, "course-map-fragment", 1)
        rewards_earned.append("course-discovered")
        _record_ledger(db, user_id, workout, "course-discovered", payload={"route_id": str(route.id)})
        inventory_earned["course-map-fragment"] = 1

    completed_course_runs = len(previous_runs) + 1
    if completed_course_runs in {3, 5} or (completed_course_runs > 5 and completed_course_runs % 5 == 0):
        grant_reward(
            db,
            user_id,
            "course-familiarity",
            label="Course Familiarity",
            summary=f"Your {completed_course_runs}th visit gave {route.name} a few more familiar details.",
            extra_payload={"route_id": str(route.id), "workout_id": str(workout.id), "visits": completed_course_runs}
        )
        grant_inventory_item(db, user_id, "postcard-fragment", 1)
        rewards_earned.append("course-familiarity")
        _record_ledger(db, user_id, workout, "course-familiarity", payload={"route_id": str(route.id), "visits": completed_course_runs})
        inventory_earned["postcard-fragment"] = 1

    chapter = chapter_for_visit(completed_course_runs)
    if chapter:
        grant_reward(
            db,
            user_id,
            "course-chapter",
            label=f"{route.name}: {chapter['title']}",
            summary=chapter["story"],
            extra_payload={
                "route_id": str(route.id),
                "workout_id": str(workout.id),
                "visits": completed_course_runs,
                "keepsake": chapter["keepsake"],
                "item_key": chapter["item_key"],
            },
        )
        grant_inventory_item(db, user_id, chapter["item_key"], 1)
        rewards_earned.append("course-chapter")
        inventory_earned[chapter["item_key"]] = 1
        _record_ledger(
            db,
            user_id,
            workout,
            "course-chapter",
            payload={
                "route_id": str(route.id),
                "chapter": chapter["title"],
                "visits": completed_course_runs,
                "keepsake": chapter["keepsake"],
                "item_key": chapter["item_key"],
            },
        )

    total_runs = db.query(func.count(Workout.id)).filter(Workout.user_id == user_id).scalar() or 0
    if total_runs > 0 and total_runs % 5 == 0:
        grant_reward(
            db,
            user_id,
            "arcade-attraction",
            label="A New Arcade Attraction",
            summary=f"Your {total_runs}th adventure opened a brand-new place to explore.",
            extra_payload={"workout_id": str(workout.id), "run_number": int(total_runs)}
        )
        grant_inventory_item(db, user_id, "arcade-decoration", 1)
        rewards_earned.append("arcade-attraction")
        _record_ledger(db, user_id, workout, "arcade-attraction", payload={"run_number": int(total_runs)})
        inventory_earned["arcade-decoration"] = inventory_earned.get("arcade-decoration", 0) + 1

    if workout.source == "watch":
        watch_runs = (
            db.query(Workout)
            .filter(Workout.user_id == user_id, Workout.source == "watch", Workout.id != workout.id)
            .count()
        )
        if watch_runs == 0:
            grant_reward(
                db,
                user_id,
                "watch-link",
                label="Watch Link Online",
                summary="Your Apple Watch is now a little window into your Jogmania worlds.",
                extra_payload={"workout_id": str(workout.id)}
            )
            rewards_earned.append("watch-link")
            grant_inventory_item(db, user_id, "chrono-spark", 1)
            inventory_earned["chrono-spark"] = 1
            _record_ledger(db, user_id, workout, "watch-link", payload={"item": "chrono-spark"})

    return {
        "points": run_points,
        "level": new_level,
        "rewards": rewards_earned,
        "inventory": inventory_earned
    }
