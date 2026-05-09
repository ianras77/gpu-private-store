from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import mean, stdev
from typing import List, Dict, Any
import random

from app.utils.geo import haversine_m
from app.services.fama_world import pick_faction, pick_relic, pick_verb


@dataclass
class SegmentStat:
    duration_s: float
    pace_s_per_km: float


def _to_epoch(ts) -> float:
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.timestamp()
    if isinstance(ts, str):
        normalized = ts.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return 0.0
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    return 0.0


def _series(points: List[dict]) -> tuple[list[float], list[float]]:
    distances: list[float] = []
    times: list[float] = []
    total = 0.0
    for idx, point in enumerate(points):
        ts = _to_epoch(point["timestamp"])
        if idx == 0:
            distances.append(0.0)
            times.append(ts)
            continue
        prev = points[idx - 1]
        total += haversine_m(prev["lat"], prev["lon"], point["lat"], point["lon"])
        distances.append(total)
        times.append(ts)
    return distances, times


def _time_at_distance(distances: List[float], times: List[float], target: float) -> float:
    if not distances:
        return 0.0
    if target <= 0:
        return times[0]
    if target >= distances[-1]:
        return times[-1]
    for i in range(1, len(distances)):
        if distances[i] >= target:
            d0, d1 = distances[i - 1], distances[i]
            t0, t1 = times[i - 1], times[i]
            span = d1 - d0
            if span <= 0:
                return t1
            ratio = (target - d0) / span
            return t0 + ratio * (t1 - t0)
    return times[-1]


def compute_segment_stats(points: List[dict], segments: List[dict]) -> List[SegmentStat]:
    if len(points) < 2 or not segments:
        return []
    distances, times = _series(points)
    stats: list[SegmentStat] = []
    for seg in segments:
        start = _time_at_distance(distances, times, seg["distance_start_m"])
        end = _time_at_distance(distances, times, seg["distance_end_m"])
        duration = max(1.0, end - start)
        distance = max(0.01, seg["distance_end_m"] - seg["distance_start_m"])
        pace = duration / (distance / 1000)
        stats.append(SegmentStat(duration_s=duration, pace_s_per_km=pace))
    return stats


def compute_flow_score(points: List[dict]) -> int:
    if len(points) < 3:
        return 0
    speeds = []
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        dt = _to_epoch(cur["timestamp"]) - _to_epoch(prev["timestamp"])
        if dt <= 0:
            continue
        dist = haversine_m(prev["lat"], prev["lon"], cur["lat"], cur["lon"])
        speeds.append(dist / dt)
    if len(speeds) < 3:
        return 0
    avg = mean(speeds)
    if avg <= 0:
        return 0
    variability = stdev(speeds) / avg if len(speeds) > 1 else 0
    score = max(0, min(100, round(100 - variability * 100)))
    return score


def build_world_state(state: dict, segments_count: int) -> dict:
    if not state:
        state = {}
    state.setdefault("chapter", 1)
    state.setdefault("threat", 1)
    state.setdefault("sessions", 0)
    state.setdefault("relics", [])
    state.setdefault("best_pace_by_segment", [None] * segments_count)
    state.setdefault("success_streak", 0)
    state.setdefault("bosses_defeated", 0)
    state.setdefault("boss_ready", False)
    return state


def play_session(
    party: dict,
    world: dict,
    workout: dict,
    gps_points: List[dict],
    adventure_summary: dict | None
) -> dict:
    rng = random.Random(world["seed"] + workout.get("seed", 0))
    segments = adventure_summary.get("segments") if adventure_summary else []
    if not segments:
        distance_m = workout.get("distance_m", 0) or 0
        step = distance_m / 3 if distance_m else 0
        segments = [
            {"distance_start_m": step * idx, "distance_end_m": step * (idx + 1), "biome": "Unknown", "hazards": [], "loot": []}
            for idx in range(3)
        ]

    state = build_world_state(world.get("state_json") or {}, len(segments))
    current_chapter = state.get("chapter", 1)
    stats = compute_segment_stats(gps_points, segments)
    best_pace = state.get("best_pace_by_segment", [None] * len(segments))

    members = party.get("members", [])
    if not members:
        members = [
            {"name": "Echo", "role": "Scout"},
            {"name": "Blaze", "role": "Runner"},
            {"name": "Vale", "role": "Anchor"}
        ]

    beats: list[str] = []
    battles: list[str] = []
    hazard_clears = 0
    improved_count = 0
    speed_points = 0

    for idx, segment in enumerate(segments):
        stat = stats[idx] if idx < len(stats) else None
        biome = segment.get("biome") or "Shadow Quarter"
        hazard = (segment.get("hazards") or ["shifting pit"])[0]
        loot = (segment.get("loot") or ["signal shard"])[0]
        member = members[idx % len(members)]
        verb = pick_verb(world["seed"], idx)

        if stat and best_pace[idx]:
            improvement = (best_pace[idx] - stat.pace_s_per_km) / best_pace[idx]
            improved = improvement > 0
            if improved:
                improved_count += 1
                speed_points += max(0, int(improvement * 200))
            hazard_clear = improvement >= 0.05
        else:
            improvement = 0
            improved = False
            hazard_clear = False

        if stat and (best_pace[idx] is None or stat.pace_s_per_km < best_pace[idx]):
            best_pace[idx] = stat.pace_s_per_km

        if hazard_clear:
            hazard_clears += 1
            beats.append(
                f"{member['name']} {verb} the {hazard} in {biome}, earning {loot} for the party."
            )
            battles.append(
                f"Pitfall cleared: {member['name']} times the dodge and lands a clean counter."
            )
        else:
            beats.append(
                f"{member['name']} clashes with the {hazard} in {biome}; the party regroups and presses on."
            )
            battles.append(
                f"Pitfall hit: tempo lost, but {member['name']} shields the crew."
            )

    flow_score = compute_flow_score(gps_points)
    base_points = len(segments) * 50
    hazard_bonus = hazard_clears * 40
    combo_bonus = max(0, improved_count - 1) * 30
    total_points = base_points + speed_points + hazard_bonus + combo_bonus

    rank = "C"
    if total_points >= 700:
        rank = "S"
    elif total_points >= 550:
        rank = "A"
    elif total_points >= 400:
        rank = "B"

    success = hazard_clears >= 2 or total_points >= 500
    success_streak = state.get("success_streak", 0)
    bosses_defeated = state.get("bosses_defeated", 0)
    boss_threshold = 3
    boss_active = False
    boss_defeated = False

    if success:
        success_streak += 1
    else:
        success_streak = 0

    if success_streak >= boss_threshold:
        boss_active = True
        success_streak = 0

    if boss_active:
        boss_defeated = total_points >= 600 or (hazard_clears >= 2 and flow_score >= 70)
        if boss_defeated:
            bosses_defeated += 1
        else:
            state["boss_ready"] = True
    else:
        state["boss_ready"] = False

    state["chapter"] = current_chapter + 1
    state["sessions"] = state.get("sessions", 0) + 1
    state["best_pace_by_segment"] = best_pace
    state["success_streak"] = success_streak
    state["bosses_defeated"] = bosses_defeated

    threat = state.get("threat", 1)
    if hazard_clears >= 2:
        threat = max(1, threat - 1)
    elif hazard_clears == 0:
        threat += 1
    if boss_active and boss_defeated:
        threat = max(1, threat - 2)
    if boss_active and not boss_defeated:
        threat += 1
    state["threat"] = threat

    relics = state.get("relics", [])
    new_relic = None
    if total_points >= 600 and len(relics) < 3:
        new_relic = pick_relic(world["seed"], len(relics))
        relics.append(new_relic)
    if boss_active and boss_defeated and len(relics) < 3:
        new_relic = pick_relic(world["seed"], len(relics))
        relics.append(new_relic)
    state["relics"] = relics

    faction = pick_faction(world["seed"])
    title = f"Chapter {current_chapter}: {adventure_summary.get('title', world['name']) if adventure_summary else world['name']}"
    intro = (
        f"{party['name']} enters {world['name']}, a realm held by the {faction}. "
        f"The course shifts into {adventure_summary.get('title', 'a new course') if adventure_summary else 'a new course'}."
    )
    outro = (
        f"Threat level now {threat}. Flow score {flow_score}. "
        f"Rank {rank}. {new_relic + ' recovered.' if new_relic else 'No relic recovered.'}"
    )

    boss_event = None
    if boss_active:
        boss_title = f"Boss Encounter: {pick_faction(world['seed'])} Warden"
        boss_event = {
            "title": boss_title,
            "defeated": boss_defeated
        }
        if boss_defeated:
            beats.append("A rift opens and your crew storms the Warden's bridge, breaking the signal core.")
            battles.append("Boss defeated: the Warden collapses into static and the path clears.")
        else:
            beats.append("The Warden surges forward. Your party absorbs the shock and retreats to regroup.")
            battles.append("Boss survives: the Warden marks your party for the next session.")

    return {
        "title": title,
        "intro": intro,
        "beats": beats,
        "battles": battles,
        "outro": outro,
        "boss_event": boss_event,
        "score": {
            "points": total_points,
            "rank": rank,
            "flow": flow_score,
            "hazard_clears": hazard_clears,
            "combo": improved_count,
            "speed_points": speed_points
        },
        "state": state
    }
