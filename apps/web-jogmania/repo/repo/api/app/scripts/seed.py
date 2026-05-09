import random
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.core.security import get_password_hash
from app.models import User, Workout, GpsPoint, RouteInstance, Adventure, Party, PartyMember, World
from app.services.route_detector import detect_or_create_route
from app.services.fama_world import pick_world_name
from app.services.starter_content import ensure_user_baseline


def generate_points(start_lat: float, start_lon: float, count: int, step: float):
    points = []
    base_time = datetime.now(timezone.utc) - timedelta(days=1)
    for i in range(count):
        lat = start_lat + (i * step)
        lon = start_lon + (i * step * 0.8)
        points.append({
            "lat": lat,
            "lon": lon,
            "timestamp": base_time + timedelta(seconds=i * 15)
        })
    return points


def seed():
    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "demo@jogmania.com").first()
        if not user:
            user = User(email="demo@jogmania.com", password_hash=get_password_hash("demo1234"))
            db.add(user)
            db.commit()
            db.refresh(user)

        ensure_user_baseline(db, user.id)
        db.commit()

        workouts = db.query(Workout).filter(Workout.user_id == user.id).count()
        if workouts > 0:
            return

        seeds = [101, 202, 303]
        route_specs = [
            {"lat": 37.7749, "lon": -122.4194, "step": 0.0003, "count": 48},
            {"lat": 37.7749, "lon": -122.4194, "step": 0.0003, "count": 48},
            {"lat": 37.7812, "lon": -122.4122, "step": 0.00045, "count": 56}
        ]

        created_routes = []

        for idx, seed in enumerate(seeds):
            distance_m = 3200 + idx * 550
            duration_s = 1200 + idx * 210
            avg_pace = (duration_s / (distance_m / 1000))
            start_time = datetime.now(timezone.utc) - timedelta(days=idx + 1)
            end_time = start_time + timedelta(seconds=duration_s)

            workout = Workout(
                user_id=user.id,
                source="ios",
                started_at=start_time,
                ended_at=end_time,
                duration_s=duration_s,
                distance_m=distance_m,
                avg_pace_s_per_km=avg_pace,
                calories_kcal=420 + idx * 80,
                avg_hr=148 + idx * 5,
                elevation_gain_m=45 + idx * 12,
                raw_payload_json={"seed": seed}
            )
            db.add(workout)
            db.flush()

            spec = route_specs[idx]
            gps_payload = generate_points(spec["lat"], spec["lon"], spec["count"], spec["step"])
            gps_points = []
            for i, p in enumerate(gps_payload):
                gps_points.append(GpsPoint(
                    workout_id=workout.id,
                    seq=i,
                    lat=p["lat"],
                    lon=p["lon"],
                    altitude_m=12 + i * 0.2,
                    timestamp=p["timestamp"],
                    accuracy_m=5
                ))
            db.add_all(gps_points)
            db.flush()

            points = [(p.lat, p.lon) for p in gps_points]
            route = detect_or_create_route(db, user.id, points)
            route.is_course = True
            db.flush()

            created_routes.append(route)

            route_instance = RouteInstance(
                route_id=route.id,
                workout_id=workout.id,
                instance_seed=seed,
                difficulty=3 + idx
            )
            db.add(route_instance)
            db.flush()

            adventure_summary = random.choice([{
                "title": "Synth Jungle Run",
                "seed": seed,
                "boss_moment": idx == 1,
                "obstacle_density": 0.5,
                "collectibles": ["Glow Band", "Arcade Token"],
                "scenes": ["Dawn Launch", "Temple Sprint", "Moonlit Escape"],
                "segments": [
                    {
                        "distance_start_m": 0,
                        "distance_end_m": distance_m * 0.33,
                        "biome": "Neon Jungle",
                        "hazards": ["rolling logs"],
                        "loot": ["gold idol", "energy orb"]
                    },
                    {
                        "distance_start_m": distance_m * 0.33,
                        "distance_end_m": distance_m * 0.66,
                        "biome": "Synth Ruins",
                        "hazards": ["laser vines"],
                        "loot": ["arcade token", "relic shard"]
                    },
                    {
                        "distance_start_m": distance_m * 0.66,
                        "distance_end_m": distance_m,
                        "biome": "Crystal Ravine",
                        "hazards": ["pitfall chasm"],
                        "loot": ["aqua gem", "energy orb"]
                    }
                ]
            }])

            adventure = Adventure(route_instance_id=route_instance.id, summary_json=adventure_summary)
            db.add(adventure)

        party = db.query(Party).filter(Party.user_id == user.id, Party.name == "Arcade Vanguard").first()
        if not party:
            party = Party(user_id=user.id, name="Arcade Vanguard")
            db.add(party)
            seed_val = 4242
            world = World(
                party=party,
                name=pick_world_name(seed_val),
                theme="neon",
                seed=seed_val,
                route_id=created_routes[0].id if created_routes else None,
                state_json={"chapter": 1, "threat": 1, "sessions": 0, "relics": []}
            )
            db.add(world)
            members = [
                PartyMember(party=party, name="Nova", role="Scout"),
                PartyMember(party=party, name="Pulse", role="Runner"),
                PartyMember(party=party, name="Glyph", role="Guardian")
            ]
            db.add_all(members)

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
