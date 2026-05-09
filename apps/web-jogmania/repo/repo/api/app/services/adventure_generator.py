import random
from typing import List, Tuple, Dict, Any
from statistics import mean, stdev
import httpx
from app.core.config import settings
from app.utils.geo import haversine_m
from datetime import datetime, timezone


Point = Tuple[float, float, float]


def _speed_samples(points: List[Tuple[float, float, float]]) -> List[float]:
    speeds = []
    for i in range(1, len(points)):
        lat1, lon1, t1 = points[i - 1]
        lat2, lon2, t2 = points[i]
        dt = max(t2 - t1, 1)
        dist = haversine_m(lat1, lon1, lat2, lon2)
        speeds.append(dist / dt)
    return speeds


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
    llm_title: str | None = None
) -> Dict[str, Any]:
    rng = random.Random(seed)
    obstacle_density = _obstacle_density(speeds, elevation_gain_m)
    collectibles = _collectibles(avg_hr, calories)
    boss_moment = _boss_moment(speeds, avg_hr)
    scenes = ["Dawn Launch", "Mirror-Lake Dash", "Temple Sprint"]
    rng.shuffle(scenes)
    segments = _segments(distance_m, rng, obstacle_density)

    return {
        "title": llm_title or f"Synth Jungle Run #{seed % 999}",
        "seed": seed,
        "boss_moment": boss_moment,
        "obstacle_density": obstacle_density,
        "collectibles": collectibles,
        "scenes": scenes[:3],
        "segments": segments
    }


def compute_speeds_from_points(points: List[Tuple[float, float, float]]) -> List[float]:
    return _speed_samples(points)


def extract_point_times(points: List[dict]) -> List[Tuple[float, float, float]]:
    data = []
    for p in points:
        ts = p["timestamp"]
        if isinstance(ts, str):
            normalized = ts.strip()
            if normalized.endswith("Z"):
                normalized = normalized[:-1] + "+00:00"
            ts = datetime.fromisoformat(normalized)
        if isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        data.append((p["lat"], p["lon"], ts.timestamp()))
    return data


async def build_adventure(points: List[dict], workout: dict, seed: int) -> Dict[str, Any]:
    timed = extract_point_times(points)
    speeds = compute_speeds_from_points(timed)
    distance_m = workout.get("distance_m") or 0
    llm_title = await _llm_title(seed, distance_m)
    return generate_adventure_summary(
        distance_m=distance_m,
        speeds=speeds,
        avg_hr=workout.get("avg_hr"),
        calories=workout.get("calories_kcal"),
        elevation_gain_m=workout.get("elevation_gain_m"),
        seed=seed,
        llm_title=llm_title
    )
