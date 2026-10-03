import math
import random
from typing import List, Tuple, Dict, Any
from app.utils.geo import haversine_m
from datetime import datetime, timezone


Point = Tuple[float, float, float]
TrackPoint = Dict[str, float | None]


def _speed_samples(points: List[Tuple[float, float, float]]) -> List[float]:
    speeds = []
    for i in range(1, len(points)):
        lat1, lon1, t1 = points[i - 1]
        lat2, lon2, t2 = points[i]
        dt = max(t2 - t1, 1)
        dist = haversine_m(lat1, lon1, lat2, lon2)
        speeds.append(dist / dt)
    return speeds


def _to_epoch(ts: Any) -> float:
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.timestamp()
    if isinstance(ts, str):
        normalized = ts.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    return 0.0


def _bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    y = math.sin(delta_lon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _angle_delta(first: float, second: float) -> float:
    return abs((second - first + 180) % 360 - 180)


def _build_track(points: List[dict]) -> list[TrackPoint]:
    track: list[TrackPoint] = []
    distance_m = 0.0
    previous: dict | None = None
    for point in points:
        if previous is not None:
            distance_m += haversine_m(previous["lat"], previous["lon"], point["lat"], point["lon"])
        track.append(
            {
                "lat": float(point["lat"]),
                "lon": float(point["lon"]),
                "timestamp": _to_epoch(point.get("timestamp")),
                "altitude_m": point.get("altitude_m"),
                "distance_m": distance_m,
            }
        )
        previous = point
    return track


def _turn_events(track: list[TrackPoint]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if len(track) < 3:
        return events

    for index in range(1, len(track) - 1):
        previous = track[index - 1]
        current = track[index]
        next_point = track[index + 1]
        first_bearing = _bearing_degrees(
            float(previous["lat"]),
            float(previous["lon"]),
            float(current["lat"]),
            float(current["lon"]),
        )
        second_bearing = _bearing_degrees(
            float(current["lat"]),
            float(current["lon"]),
            float(next_point["lat"]),
            float(next_point["lon"]),
        )
        angle = _angle_delta(first_bearing, second_bearing)
        if angle >= 55:
            events.append(
                {
                    "kind": "turn",
                    "title": "The Secret Bend",
                    "distance_m": round(float(current["distance_m"] or 0), 1),
                    "intensity": round(min(angle / 120, 1.0), 2),
                    "description": "The path made a turn, and a tiny door winked from the hedge.",
                    "tone": "cyan",
                }
            )
    return events


def _climb_events(track: list[TrackPoint]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if len(track) < 2:
        return events

    rolling_gain = 0.0
    climb_start = float(track[0]["distance_m"] or 0)
    for index in range(1, len(track)):
        previous_alt = track[index - 1].get("altitude_m")
        current_alt = track[index].get("altitude_m")
        if previous_alt is None or current_alt is None:
            continue
        delta = float(current_alt) - float(previous_alt)
        if delta > 0:
            rolling_gain += delta
        if delta <= 0 or index == len(track) - 1:
            if rolling_gain >= 8:
                end_distance = float(track[index]["distance_m"] or climb_start)
                events.append(
                    {
                        "kind": "climb",
                        "title": "Lantern Hill",
                        "distance_m": round((climb_start + end_distance) / 2, 1),
                        "intensity": round(min(rolling_gain / 35, 1.0), 2),
                        "description": "A little lantern garden appeared on the hillside.",
                        "tone": "acid",
                    }
                )
            climb_start = float(track[index]["distance_m"] or 0)
            rolling_gain = 0.0
    return events


def _collectibles(turn_count: int, climb_count: int, rng: random.Random) -> List[str]:
    items = ["Ticket Stub from Nowhere", "Glow Pebble", "Moon Moth Sticker", "Riverglass Marble", "Pocket-Sized Pinball"]
    count = min(4, 1 + min(2, turn_count // 3) + min(1, climb_count // 2))
    return rng.sample(items, k=count)


def _segments(distance_m: float, rng: random.Random, _story_density: float) -> List[Dict[str, Any]]:
    biomes = ["Neon Canopy", "Moonlight Boardwalk", "Crystal Picnic Hill", "Jellybean Garden", "Pinball Lagoon"]
    friends = ["wind-up bird", "crooked sign", "moon puddle", "pinball mushroom", "lantern mouse"]
    loot = ["golden ticket", "glow pebble", "arcade token", "moth sticker", "riverglass marble"]
    stage_names = ["The First Clue", "A Curious Detour", "The Prize Hunt", "The Big Reveal", "The Grand Finale"]
    route_distance = max(1.0, float(distance_m or 0))
    # The route is paced in physical checkpoints. Short outings stay compact;
    # longer routes naturally gain chapters rather than always getting thirds.
    segment_count = max(1, min(8, math.ceil(route_distance / 650)))
    checkpoint_m = route_distance / segment_count
    segments = []
    for i in range(segment_count):
        seg_hazards = rng.sample(friends, k=1)
        seg_loot = rng.sample(loot, k=2)
        if segment_count == 1:
            stage_index = 2
        elif i == 0:
            stage_index = 0
        elif i == segment_count - 1:
            stage_index = len(stage_names) - 1
        else:
            middle_count = segment_count - 2
            middle_progress = 0 if middle_count == 1 else (i - 1) / (middle_count - 1)
            stage_index = 1 + round(middle_progress * (len(stage_names) - 3))
        segments.append({
            "distance_start_m": round(checkpoint_m * i, 1),
            "distance_end_m": round(route_distance if i == segment_count - 1 else checkpoint_m * (i + 1), 1),
            "chapter_title": "One Big Adventure" if segment_count == 1 else stage_names[stage_index],
            "biome": rng.choice(biomes),
            "hazards": seg_hazards,
            "loot": seg_loot
        })
    return segments


def _segment_index_for_distance(segments: list[dict[str, Any]], distance_m: float) -> int:
    if not segments:
        return 0
    for index, segment in enumerate(segments):
        if segment["distance_start_m"] <= distance_m <= segment["distance_end_m"]:
            return index
    return len(segments) - 1


def _apply_encounters_to_segments(segments: list[dict[str, Any]], encounters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for encounter in encounters:
        index = _segment_index_for_distance(segments, float(encounter.get("distance_m") or 0))
        discovery = encounter.get("title")
        if not isinstance(discovery, str):
            continue
        souvenirs = segments[index].setdefault("loot", [])
        if discovery not in souvenirs:
            souvenirs.insert(0, discovery)
    return segments


def generate_adventure_summary(
    distance_m: float,
    speeds: List[float],
    avg_hr: float | None,
    calories: float | None,
    elevation_gain_m: float | None,
    seed: int,
    llm_title: str | None = None,
    track: list[TrackPoint] | None = None,
    raw_payload: dict[str, Any] | None = None,
) -> Dict[str, Any]:
    rng = random.Random(seed)
    track = track or []
    turn_events = _turn_events(track)
    climb_events = _climb_events(track)
    obstacle_density = 0.0
    collectibles = _collectibles(len(turn_events), len(climb_events), rng)
    scenes = ["Moonlit Boardwalk", "Lantern Picnic", "Pinball Garden"]
    rng.shuffle(scenes)
    segments = _segments(distance_m, rng, obstacle_density)
    encounters = sorted(
        [*climb_events, *turn_events],
        key=lambda event: (float(event.get("distance_m") or 0), event.get("kind") or ""),
    )
    segments = _apply_encounters_to_segments(segments, encounters)
    map_layers = [
        {
            "kind": encounter["kind"],
            "label": encounter["title"],
            "distance_m": encounter["distance_m"],
            "intensity": encounter["intensity"],
            "tone": encounter["tone"],
        }
        for encounter in encounters
    ]
    route_features = {
        "turn_count": len(turn_events),
        "climb_count": len(climb_events),
        "elevation_gain_m": round(elevation_gain_m or 0, 1),
    }

    return {
        "title": llm_title or f"{scenes[0]} Story",
        "seed": seed,
        "boss_moment": False,
        "obstacle_density": obstacle_density,
        "collectibles": collectibles,
        "scenes": scenes[:3],
        "segments": segments,
        "route_features": route_features,
        "encounters": [
            {
                "kind": event["kind"],
                "title": event["title"],
                "distance_m": event["distance_m"],
                "intensity": event["intensity"],
                "description": event["description"],
            }
            for event in encounters
        ],
        "map_layers": map_layers,
    }


def compute_speeds_from_points(points: List[Tuple[float, float, float]]) -> List[float]:
    return _speed_samples(points)


def extract_point_times(points: List[dict]) -> List[Tuple[float, float, float]]:
    data = []
    for p in points:
        data.append((p["lat"], p["lon"], _to_epoch(p["timestamp"])))
    return data


async def build_adventure(points: List[dict], workout: dict, seed: int) -> Dict[str, Any]:
    distance_m = workout.get("distance_m") or 0
    track = _build_track(points)
    return generate_adventure_summary(
        distance_m=distance_m,
        speeds=[],
        avg_hr=None,
        calories=None,
        elevation_gain_m=workout.get("elevation_gain_m"),
        seed=seed,
        track=track,
    )
