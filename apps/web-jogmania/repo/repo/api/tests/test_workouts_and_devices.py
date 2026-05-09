from datetime import datetime, timedelta, timezone

from app.models import Adventure, Device, Party, Route, RouteInstance, Workout, WorldEvent


def register_and_auth(client, email: str, password: str = "strongpass"):
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def workout_payload(
    *,
    started_at: datetime,
    duration_s: int,
    distance_m: float,
    source: str = "ios",
    avg_hr: float | None = 150,
    device: dict | None = None,
    route_id: str | None = None,
    device_id: str | None = None,
    companion_device_id: str | None = None,
):
    coordinates = [
        (37.7749, -122.4194),
        (37.7755, -122.4189),
        (37.7761, -122.4181),
    ]
    step = duration_s / max(len(coordinates) - 1, 1)
    ended_at = started_at + timedelta(seconds=duration_s)
    gps_points = []
    for idx, (lat, lon) in enumerate(coordinates):
        gps_points.append(
            {
                "lat": lat,
                "lon": lon,
                "altitude_m": 12 + idx,
                "timestamp": (started_at + timedelta(seconds=step * idx)).isoformat(),
                "accuracy_m": 5,
            }
        )

    return {
        "source": source,
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "duration_s": duration_s,
        "distance_m": distance_m,
        "avg_pace_s_per_km": duration_s / (distance_m / 1000),
        "calories_kcal": 320,
        "avg_hr": avg_hr,
        "elevation_gain_m": 35,
        "route_id": route_id,
        "device_id": device_id,
        "raw_payload_json": {
            "capture_mode": "test",
            "device_id": device_id,
            "companion_device_id": companion_device_id,
        },
        "device": device,
        "gps_points": gps_points,
    }


def test_register_bootstraps_starter_pack(client):
    headers = register_and_auth(client, "starter@jogmania.com")

    routes = client.get("/routes", headers=headers)
    parties = client.get("/parties", headers=headers)
    rewards = client.get("/rewards", headers=headers)
    inventory = client.get("/inventory", headers=headers)

    assert routes.status_code == 200
    assert parties.status_code == 200
    assert rewards.status_code == 200
    assert inventory.status_code == 200

    routes_data = routes.json()
    assert len(routes_data) == 3
    assert all(route["is_course"] for route in routes_data)

    parties_data = parties.json()
    assert len(parties_data) == 1
    assert parties_data[0]["world"]["route_id"] in {route["id"] for route in routes_data}

    reward_types = {reward["type"] for reward in rewards.json()}
    assert "starter-pack" in reward_types

    inventory_items = {item["item_key"]: item["quantity"] for item in inventory.json()}
    assert inventory_items["arcade-token"] == 5
    assert inventory_items["glow-band"] == 1


def test_create_workout_awards_progress_and_registers_ios_device(client, db_session):
    headers = register_and_auth(client, "runner@jogmania.com")
    selected_route = client.get("/parties", headers=headers).json()[0]["world"]["route_id"]
    payload = workout_payload(
        started_at=datetime(2026, 3, 20, 8, 0, tzinfo=timezone.utc),
        duration_s=1560,
        distance_m=3200,
        route_id=selected_route,
        device_id="ios-main",
    )

    response = client.post("/workouts", json=payload, headers=headers)

    assert response.status_code == 200
    workout = response.json()
    assert workout["route_id"] == selected_route

    assert db_session.query(Workout).count() == 1
    assert db_session.query(Route).count() == 3
    assert db_session.query(RouteInstance).count() == 1
    assert db_session.query(Adventure).count() == 1
    assert db_session.query(Device).count() == 1
    assert db_session.query(WorldEvent).count() == 1

    devices = client.get("/devices", headers=headers)
    assert devices.status_code == 200
    assert devices.json()[0]["platform"] == "ios"
    assert devices.json()[0]["device_id"] == "ios-main"
    assert devices.json()[0]["last_sync_at"]

    rewards = client.get("/rewards", headers=headers).json()
    reward_types = {reward["type"] for reward in rewards}
    assert "run-complete" in reward_types
    assert "course-discovered" in reward_types

    inventory_items = {item["item_key"]: item["quantity"] for item in client.get("/inventory", headers=headers).json()}
    assert inventory_items["arcade-token"] > 5
    assert inventory_items["course-map-fragment"] == 1


def test_watch_workout_awards_watch_link_and_inventory(client):
    headers = register_and_auth(client, "watch@jogmania.com")
    payload = workout_payload(
        started_at=datetime(2026, 3, 20, 9, 0, tzinfo=timezone.utc),
        duration_s=1440,
        distance_m=3000,
        source="watch",
        device_id="watch-main",
        companion_device_id="ios-main",
    )

    response = client.post("/workouts", json=payload, headers=headers)
    assert response.status_code == 200

    reward_types = {reward["type"] for reward in client.get("/rewards", headers=headers).json()}
    assert "watch-link" in reward_types

    devices = client.get("/devices", headers=headers).json()
    assert devices[0]["platform"] == "watch"
    assert devices[0]["companion_device_id"] == "ios-main"

    inventory_items = {item["item_key"]: item["quantity"] for item in client.get("/inventory", headers=headers).json()}
    assert inventory_items["chrono-spark"] == 1


def test_device_registration_is_idempotent(client, db_session):
    headers = register_and_auth(client, "devices@jogmania.com")
    payload = {
        "platform": "watch",
        "device_id": "watch-main",
        "name": "Jogmania Apple Watch",
        "companion_device_id": "ios-main",
    }

    first = client.post("/devices/register", json=payload, headers=headers)
    second = client.post("/devices/register", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert db_session.query(Device).count() == 1


def test_workout_progress_is_per_user_and_grants_course_record(client):
    user_one = register_and_auth(client, "user-one@jogmania.com")
    first_run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 20, 6, 0, tzinfo=timezone.utc),
            duration_s=1800,
            distance_m=3000,
            device_id="ios-1",
        ),
        headers=user_one,
    )
    assert first_run.status_code == 200

    second_run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 21, 6, 0, tzinfo=timezone.utc),
            duration_s=1500,
            distance_m=3000,
            device_id="ios-1",
        ),
        headers=user_one,
    )
    assert second_run.status_code == 200

    reward_types = {reward["type"] for reward in client.get("/rewards", headers=user_one).json()}
    assert "course-record" in reward_types

    inventory_items = {item["item_key"]: item["quantity"] for item in client.get("/inventory", headers=user_one).json()}
    assert inventory_items["speed-rune"] == 1

    user_two = register_and_auth(client, "user-two@jogmania.com")
    other_user_view = client.get(f"/workouts/{second_run.json()['id']}", headers=user_two)
    assert other_user_view.status_code == 404


def test_selected_course_run_autoplays_default_world(client, db_session):
    headers = register_and_auth(client, "story@jogmania.com")
    party = client.get("/parties", headers=headers).json()[0]
    selected_route = party["world"]["route_id"]

    response = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 21, 8, 0, tzinfo=timezone.utc),
            duration_s=1320,
            distance_m=2800,
            route_id=selected_route,
            device_id="ios-story",
        ),
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["route_id"] == selected_route
    assert db_session.query(Party).count() == 1
    assert db_session.query(WorldEvent).count() == 1

    events = client.get(f"/parties/{party['id']}/world/events", headers=headers)
    assert events.status_code == 200
    assert len(events.json()) == 1
    assert events.json()[0]["workout_id"] == response.json()["id"]
