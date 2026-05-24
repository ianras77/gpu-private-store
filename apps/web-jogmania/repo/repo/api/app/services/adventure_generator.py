import math
import random
from typing import List, Tuple, Dict, Any
from statistics import mean, stdev
import httpx
from app.core.config import settings
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


def _event_distance_from_timestamp(track: list[TrackPoint], timestamp: float, fallback: float) -> float:
    if len(track) < 2:
        return fallback
    if timestamp <= float(track[0]["timestamp"] or 0):
        return float(track[0]["distance_m"] or 0)
    if timestamp >= float(track[-1]["timestamp"] or 0):
        return float(track[-1]["distance_m"] or fallback)

    for index in range(1, len(track)):
        previous = track[index - 1]
        current = track[index]
        previous_time = float(previous["timestamp"] or 0)
        current_time = float(current["timestamp"] or previous_time)
        if current_time >= timestamp:
            span = max(current_time - previous_time, 1)
            ratio = (timestamp - previous_time) / span
            previous_distance = float(previous["distance_m"] or 0)
            current_distance = float(current["distance_m"] or previous_distance)
            return previous_distance + (current_distance - previous_distance) * ratio
    return fallback


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
                    "title": "Switchback Snare",
                    "distance_m": round(float(current["distance_m"] or 0), 1),
                    "intensity": round(min(angle / 120, 1.0), 2),
                    "description": f"{round(angle)} degree turn became a timing trap.",
                    "hazard": "switchback snare",
                    "tone": "magenta",
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
                        "title": "Ridge Climb",
                        "distance_m": round((climb_start + end_distance) / 2, 1),
                        "intensity": round(min(rolling_gain / 35, 1.0), 2),
                        "description": f"{round(rolling_gain)} meters of gain raised the course.",
                        "hazard": "ridge climb",
                        "tone": "acid",
                    }
                )
            climb_start = float(track[index]["distance_m"] or 0)
            rolling_gain = 0.0
    return events


def _pace_surge_events(track: list[TrackPoint], speeds: list[float]) -> list[dict[str, Any]]:
    if len(track) < 2 or len(speeds) < 3:
        return []

    avg_speed = mean(speeds) or 0
    if avg_speed <= 0:
        return []

    threshold = avg_speed * 1.25
    events: list[dict[str, Any]] = []
    for index, speed in enumerate(speeds, start=1):
        if speed <= threshold:
            continue
        point = track[min(index, len(track) - 1)]
        events.append(
            {
                "kind": "pace_surge",
                "title": "Sprint Gate",
                "distance_m": round(float(point["distance_m"] or 0), 1),
                "intensity": round(min(speed / max(threshold, 0.1), 1.6) / 1.6, 2),
                "description": "A pace spike turned into a burst gate.",
                "hazard": "sprint gate",
                "tone": "cyan",
            }
        )
    return events[:3]


def _heart_rate_events(
    raw_payload: dict[str, Any],
    avg_hr: float | None,
    track: list[TrackPoint],
    distance_m: float,
) -> tuple[list[dict[str, Any]], float | None]:
    samples = raw_payload.get("heart_rate_samples")
    if not isinstance(samples, list):
        samples = raw_payload.get("heartRateSamples")
    if not isinstance(samples, list):
        samples = []

    events: list[dict[str, Any]] = []
    max_hr = avg_hr
    for sample in samples:
        if not isinstance(sample, dict):
            continue
        bpm = sample.get("bpm") or sample.get("heart_rate") or sample.get("heartRate")
        if not isinstance(bpm, (int, float)):
            continue
        max_hr = max(float(bpm), max_hr or 0)
        if bpm < 170:
            continue
        sample_distance = sample.get("distance_m")
        if isinstance(sample_distance, (int, float)):
            event_distance = float(sample_distance)
        elif sample.get("timestamp"):
            event_distance = _event_distance_from_timestamp(track, _to_epoch(sample.get("timestamp")), distance_m * 0.7)
        else:
            event_distance = distance_m * 0.7
        events.append(
            {
                "kind": "heart_rate",
                "title": "Pulse Gate",
                "distance_m": round(event_distance, 1),
                "intensity": round(min((float(bpm) - 145) / 45, 1.0), 2),
                "description": f"{round(float(bpm))} bpm became a pressure gate.",
                "hazard": "pulse gate",
                "tone": "magenta",
            }
        )

    if not events and avg_hr and avg_hr >= 165:
        max_hr = max(max_hr or 0, avg_hr)
        events.append(
            {
                "kind": "heart_rate",
                "title": "Pulse Gate",
                "distance_m": round(distance_m * 0.7, 1),
                "intensity": round(min((avg_hr - 145) / 45, 1.0), 2),
                "description": f"{round(avg_hr)} bpm average raised the danger level.",
                "hazard": "pulse gate",
                "tone": "magenta",
            }
        )
    return events[:4], max_hr


def _obstacle_density(speeds: List[float], elevation_gain_m: float | None) -> float:
    if len(speeds) < 2:
        variability = 0.2
    else:
        variability = stdev(speeds) / (mean(speeds) or 1)
    elev_factor = min((elevation_gain_m or 0) / 300.0, 1.0)
    density = min(max(0.2 + variability + elev_factor * 0.4, 0.2), 1.0)
    return round(density, 2)


def _collectibles(avg_hr: float | None, calories: float | None) -> List[str]:
    items = []
    if avg_hr:
        if avg_hr >= 165:
            items.append("Neon Heart Relic")
        elif avg_hr >= 145:
            items.append("Pulse Capsule")
        else:
            items.append("Glow Band")
    if calories:
        if calories >= 600:
            items.append("Turbo Shake")
        elif calories >= 350:
            items.append("Electro Gel")
        else:
            items.append("Mint Charge")
    if not items:
        items.append("Glow Band")
    return items


def _boss_moment(speeds: List[float], avg_hr: float | None) -> bool:
    if avg_hr and avg_hr >= 170:
        return True
    if not speeds:
        return False
    top = sorted(speeds)[int(len(speeds) * 0.9)]
    return top > (mean(speeds) * 1.35)


def _segments(distance_m: float, rng: random.Random, obstacle_density: float) -> List[Dict[str, Any]]:
    biomes = ["Neon Jungle", "Synth Ruins", "Crystal Ravine", "Laser Lagoon", "Arcade Canopy"]
    hazards = ["rolling logs", "pitfall chasm", "laser vines", "crystal spikes", "hover bats"]
    loot = ["gold idol", "energy orb", "arcade token", "relic shard", "aqua gem"]

    splits = [0, distance_m * 0.33, distance_m * 0.66, distance_m]
    segments = []
    for i in range(3):
        seg_hazards = rng.sample(hazards, k=max(1, int(1 + obstacle_density * 2)))
        seg_loot = rng.sample(loot, k=2)
        segments.append({
            "distance_start_m": round(splits[i], 1),
            "distance_end_m": round(splits[i + 1], 1),
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
        hazard = encounter.get("hazard")
        if not isinstance(hazard, str):
            continue
        hazards = segments[index].setdefault("hazards", [])
        if hazard not in hazards:
            hazards.insert(0, hazard)
    return segments


async def _llm_title(seed: int, distance_m: float) -> str | None:
    if not settings.llm_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            payload = {
                "model": settings.llm_model or "gpt-3.5-turbo",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a retro fitness narrator. Respond with a short title only."
                    },
                    {
                        "role": "user",
                        "content": f"Seed {seed}, distance {int(distance_m)} meters."
                    }
                ],
                "max_tokens": 12
            }
            headers = {"Authorization": f"Bearer {settings.llm_api_key}"} if settings.llm_api_key else {}
            res = await client.post(settings.llm_url, json=payload, headers=headers)
            if res.status_code != 200:
                return None
            data = res.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip() or None
    except Exception:
        return None


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
    raw_payload = raw_payload or {}
    track = track or []
    obstacle_density = _obstacle_density(speeds, elevation_gain_m)
    collectibles = _collectibles(avg_hr, calories)
    turn_events = _turn_events(track)
    climb_events = _climb_events(track)
    pace_events = _pace_surge_events(track, speeds)
    hr_events, max_hr = _heart_rate_events(raw_payload, avg_hr, track, distance_m)
    boss_moment = _boss_moment(speeds, max_hr or avg_hr)
    scenes = ["Dawn Launch", "Mirror-Lake Dash", "Temple Sprint"]
    rng.shuffle(scenes)
    segments = _segments(distance_m, rng, obstacle_density)
    encounters = sorted(
        [*climb_events, *turn_events, *hr_events, *pace_events],
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
        "high_hr_moments": len(hr_events),
        "pace_surge_count": len(pace_events),
        "elevation_gain_m": round(elevation_gain_m or 0, 1),
        "max_hr": round(max_hr, 1) if max_hr else None,
        "avg_speed_mps": round(mean(speeds), 2) if speeds else 0,
    }

    return {
        "title": llm_title or f"Synth Jungle Run #{seed % 999}",
        "seed": seed,
        "boss_moment": boss_moment,
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
    timed = extract_point_times(points)
    speeds = compute_speeds_from_points(timed)
    distance_m = workout.get("distance_m") or 0
    llm_title = await _llm_title(seed, distance_m)
    raw_payload = workout.get("raw_payload_json") if isinstance(workout.get("raw_payload_json"), dict) else {}
    track = _build_track(points)
    return generate_adventure_summary(
        distance_m=distance_m,
        speeds=speeds,
        avg_hr=workout.get("avg_hr"),
        calories=workout.get("calories_kcal"),
        elevation_gain_m=workout.get("elevation_gain_m"),
        seed=seed,
        llm_title=llm_title,
        track=track,
        raw_payload=raw_payload,
    )
