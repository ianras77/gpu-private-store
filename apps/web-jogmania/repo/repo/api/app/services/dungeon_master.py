from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List
import random

from app.utils.geo import haversine_m


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
    avg = sum(speeds) / len(speeds)
    if avg <= 0:
        return 0
    variance = sum((speed - avg) ** 2 for speed in speeds) / (len(speeds) - 1) if len(speeds) > 1 else 0
    variability = variance**0.5 / avg if len(speeds) > 1 else 0
    score = max(0, min(100, round(100 - variability * 100)))
    return score


def build_world_state(state: dict, segments_count: int) -> dict:
    if not state:
        state = {}
    state.setdefault("chapter", 1)
    state.setdefault("sessions", 0)
    state.setdefault("souvenirs", [])
    return state


def play_session(
    party: dict,
    world: dict,
    workout: dict,
    gps_points: List[dict],
    adventure_summary: dict | None
) -> dict:
    rng = random.Random(world["seed"] + state_seed(workout.get("id", "")))
    segments = adventure_summary.get("segments") if adventure_summary else []
    state = build_world_state(world.get("state_json") or {}, len(segments or []))
    current_chapter = state.get("chapter", 1)
    members = party.get("members", [])
    if not members:
        members = [{"name": "Nova", "role": "Friend"}, {"name": "Pulse", "role": "Pal"}, {"name": "Glyph", "role": "Guide"}]

    distance_m = max(0, float(workout.get("distance_m") or 0))
    route_scenery = [segment.get("biome") for segment in (segments or []) if segment.get("biome")]
    scenery = rng.choice(route_scenery) if route_scenery else "your favorite path"
    member = rng.choice(members)
    souvenir = rng.choice(["moon-moth sticker", "brass ticket", "star pebble", "paper crown", "glow-in-the-dark button"])
    beats = [
        f"{member['name']} spots a tiny {scenery} resident waving from the path.",
        f"A pocket-sized {souvenir} tumbles out of the grass and into the keepsake tin.",
        "Somewhere in the arcade, one old bulb gives a hopeful little blink."
    ]
    souvenir_shelf = list(state.get("souvenirs") or [])
    if souvenir not in souvenir_shelf:
        souvenir_shelf.append(souvenir)
    state["souvenirs"] = souvenir_shelf
    state["chapter"] = current_chapter + 1
    state["sessions"] = state.get("sessions", 0) + 1
    total_points = max(60, round(distance_m / 18))
    title = f"A little more of {world['name']}"
    intro = f"{party['name']} took the long way past {scenery}, and brought a tiny surprise home."
    outro = f"{souvenir.capitalize()} added to the keepsake shelf. The arcade keeps getting brighter."

    return {
        "title": title,
        "intro": intro,
        "beats": beats,
        "battles": [],
        "outro": outro,
        "boss_event": None,
        "score": {
            "points": total_points,
            "chapter": current_chapter,
            "distance_m": round(distance_m, 1),
            "souvenir": souvenir,
        },
        "state": state
    }


def state_seed(value: str) -> int:
    """Stable small seed for workout IDs across Python processes."""
    return sum((index + 1) * ord(character) for index, character in enumerate(str(value))) % 1_000_003
