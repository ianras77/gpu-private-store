import hashlib
from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models import Route
from app.utils.geo import simplify_points, normalize_points, total_distance_m


Point = Tuple[float, float]


def compute_route_hash(points: List[Point]) -> str:
    simplified = simplify_points(points, max_points=64)
    normalized = normalize_points(simplified, precision=4)
    joined = ";".join([f"{lat}:{lon}" for lat, lon in normalized])
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def auto_route_name(db: Session, user_id) -> str:
    existing = db.query(Route).filter(Route.user_id == user_id, Route.name.like("Jungle Loop #%")).count()
    return f"Jungle Loop #{existing + 1}"


def detect_or_create_route(db: Session, user_id, points: List[Point]) -> Route:
    route_hash = compute_route_hash(points)
    route = (
        db.query(Route)
        .filter(Route.user_id == user_id, Route.route_hash == route_hash)
        .first()
    )
    if route:
        return route

    route = Route(
        user_id=user_id,
        name=auto_route_name(db, user_id),
        route_hash=route_hash,
    )
    db.add(route)
    db.flush()
    return route


def route_stats(points: List[Point]) -> dict:
    distance = total_distance_m(points)
    return {"distance_m": distance}
