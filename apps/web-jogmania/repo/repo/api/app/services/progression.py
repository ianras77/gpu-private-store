from __future__ import annotations

from math import ceil
from typing import Any

from sqlalchemy.orm import Session

from app.models import InventoryItem, Reward, RouteInstance, Workout


def _round_number(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


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
    improvement_s_per_km: float | None,
    *,
    boss_moment: bool = False,
    source: str | None = None
) -> int:
    base_points = max(60, round(distance_m / 18))
    improvement_bonus = round(max(0.0, improvement_s_per_km or 0.0) * 2.5)
    boss_bonus = 80 if boss_moment else 0
    watch_bonus = 30 if source == "watch" else 0
    return base_points + improvement_bonus + boss_bonus + watch_bonus


def award_workout_progress(db: Session, user_id, workout: Workout, route, adventure_summary: dict[str, Any]) -> dict[str, Any]:
    previous_runs = _route_history(db, route.id, workout.id)
    previous_best = min((run.avg_pace_s_per_km for run in previous_runs), default=None)
    improvement = None if previous_best is None else previous_best - workout.avg_pace_s_per_km
    boss_moment = bool(adventure_summary.get("boss_moment"))
    run_points = compute_run_points(
        workout.distance_m,
        improvement,
        boss_moment=boss_moment,
        source=workout.source
    )
    token_gain = max(1, ceil(run_points / 120))
    rewards_earned: list[str] = []
    inventory_earned: dict[str, int] = {"arcade-token": token_gain}

    grant_reward(
        db,
        user_id,
        "run-complete",
        label=f"{route.name} Cleared",
        summary=f"Logged {round(workout.distance_m / 1000, 2)} km for {run_points} course points.",
        extra_payload={
            "points": run_points,
            "route_id": str(route.id),
            "workout_id": str(workout.id),
            "source": workout.source,
            "improvement_s_per_km": _round_number(improvement)
        }
    )
    rewards_earned.append("run-complete")
    grant_inventory_item(db, user_id, "arcade-token", token_gain)

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
        inventory_earned["course-map-fragment"] = 1

    if previous_best is not None and improvement and improvement > 0:
        grant_reward(
            db,
            user_id,
            "course-record",
            label="Course Record",
            summary=f"Improved your route pace by {round(improvement)} s/km.",
            extra_payload={
                "route_id": str(route.id),
                "workout_id": str(workout.id),
                "improvement_s_per_km": _round_number(improvement)
            }
        )
        grant_inventory_item(db, user_id, "speed-rune", 1)
        rewards_earned.append("course-record")
        inventory_earned["speed-rune"] = 1

    if boss_moment:
        grant_reward(
            db,
            user_id,
            "boss-surge",
            label="Boss Surge",
            summary="Your run triggered a boss-tier encounter.",
            extra_payload={"route_id": str(route.id), "workout_id": str(workout.id)}
        )
        grant_inventory_item(db, user_id, "relic-shard", 1)
        rewards_earned.append("boss-surge")
        inventory_earned["relic-shard"] = 1

    if workout.source == "watch":
        watch_runs = (
            db.query(Workout)
            .filter(Workout.user_id == user_id, Workout.source == "watch", Workout.id != workout.id)
            .count()
        )
        grant_inventory_item(db, user_id, "chrono-spark", 1)
        inventory_earned["chrono-spark"] = inventory_earned.get("chrono-spark", 0) + 1
        if watch_runs == 0:
            grant_reward(
                db,
                user_id,
                "watch-link",
                label="Watch Link Online",
                summary="Your Apple Watch pipeline is now feeding adventure runs into Jogmania.",
                extra_payload={"workout_id": str(workout.id)}
            )
            rewards_earned.append("watch-link")

    return {
        "points": run_points,
        "improvement_s_per_km": _round_number(improvement),
        "rewards": rewards_earned,
        "inventory": inventory_earned
    }
