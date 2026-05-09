import math
from typing import List, Tuple


Point = Tuple[float, float]


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def total_distance_m(points: List[Point]) -> float:
    if len(points) < 2:
        return 0.0
    dist = 0.0
    for i in range(1, len(points)):
        dist += haversine_m(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    return dist


def simplify_points(points: List[Point], max_points: int = 64) -> List[Point]:
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    simplified = points[::step]
    if simplified[-1] != points[-1]:
        simplified.append(points[-1])
    return simplified


def normalize_points(points: List[Point], precision: int = 5) -> List[Point]:
    if not points:
        return []
    base_lat, base_lon = points[0]
    norm = []
    for lat, lon in points:
        dlat = round(lat - base_lat, precision)
        dlon = round(lon - base_lon, precision)
        norm.append((dlat, dlon))
    return norm
