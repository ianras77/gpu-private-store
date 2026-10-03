from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.models import (
    AdventureSession,
    Adventure,
    Device,
    Party,
    ProgressionLedgerEntry,
    Route,
    RouteInstance,
    RunnerFeedback,
    StoryJob,
    Workout,
    WorldEvent,
)


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
    assert inventory_items["arcade-decoration"] == 1


def test_course_mastery_unlocks_story_chapters_by_visits_not_pace(client):
    headers = register_and_auth(client, "mastery@jogmania.com")
    route = client.get("/routes", headers=headers).json()[0]

    before = client.get(f"/routes/{route['id']}/mastery", headers=headers)
    assert before.status_code == 200
    assert before.json()["visits"] == 0
    assert before.json()["level"] == 0
    assert before.json()["next_chapter"]["title"] == "First Footstep"
    assert before.json()["next_chapter"]["keepsake"] == "Postcard from the Path"

    latest_payload = None
    for visit in range(3):
        latest_payload = workout_payload(
            started_at=datetime(2026, 4, 1 + visit, 8, 0, tzinfo=timezone.utc),
            duration_s=1200,
            distance_m=2400,
            route_id=route["id"],
            avg_hr=90 + visit,
        )
        response = client.post(
            "/workouts",
            json=latest_payload,
            headers=headers,
        )
        assert response.status_code == 200

    after = client.get(f"/routes/{route['id']}/mastery", headers=headers)
    assert after.status_code == 200
    assert after.json()["visits"] == 3
    assert after.json()["level"] == 2
    assert after.json()["title"] == "The Mouse Knows Your Name"
    assert after.json()["next_chapter"]["visits_required"] == 6
    assert after.json()["progress_percent"] == 0
    chapter_rewards = [reward for reward in client.get("/rewards", headers=headers).json() if reward["type"] == "course-chapter"]
    assert len(chapter_rewards) == 2
    assert {reward["payload_json"]["keepsake"] for reward in chapter_rewards} == {
        "Postcard from the Path",
        "Mouse Window Badge",
    }
    inventory = {item["item_key"]: item["quantity"] for item in client.get("/inventory", headers=headers).json()}
    assert inventory["trail-postcard"] == 1
    assert inventory["mouse-badge"] == 1

    duplicate = client.post("/workouts", json=latest_payload, headers=headers)
    assert duplicate.status_code == 200
    chapter_rewards_after_duplicate = [
        reward for reward in client.get("/rewards", headers=headers).json() if reward["type"] == "course-chapter"
    ]
    assert len(chapter_rewards_after_duplicate) == 2


def test_arcade_decoration_uses_and_returns_one_earned_credit(client):
    headers = register_and_auth(client, "decorator@jogmania.com")
    world = client.get("/adventure/world", headers=headers).json()
    assert world["decoration_tokens"] == 1
    assert len(world["decoration_slots"]) == 8

    placed = client.post(
        "/adventure/world/decorations",
        json={"slot": "roof-center", "item_key": "star-bunting"},
        headers=headers,
    )
    assert placed.status_code == 201
    assert placed.json()["title"] == "Star bunting"
    assert placed.json()["owned_by_me"] is True

    occupied = client.post(
        "/adventure/world/decorations",
        json={"slot": "roof-center", "item_key": "prize-fox"},
        headers=headers,
    )
    assert occupied.status_code == 409

    no_credit = client.post(
        "/adventure/world/decorations",
        json={"slot": "roof-left", "item_key": "prize-fox"},
        headers=headers,
    )
    assert no_credit.status_code == 409

    current = client.get("/adventure/world", headers=headers).json()
    assert current["decoration_tokens"] == 0
    assert [(item["slot"], item["item_key"]) for item in current["decorations"]] == [("roof-center", "star-bunting")]

    removed = client.delete("/adventure/world/decorations/roof-center", headers=headers)
    assert removed.status_code == 200
    assert removed.json() == {"removed": True, "returned_tokens": 1}
    assert client.get("/adventure/world", headers=headers).json()["decoration_tokens"] == 1


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

    ledger = client.get("/progression/ledger", headers=headers)
    assert ledger.status_code == 200
    entries = ledger.json()
    assert sum(entry["reason_code"] == "run-complete" for entry in entries) == 1
    assert next(entry for entry in entries if entry["reason_code"] == "run-complete")["sparks"] > 0
    assert db_session.query(ProgressionLedgerEntry).count() >= 2

    duplicate = client.post("/workouts", json=payload, headers=headers)
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == workout["id"]
    assert client.get("/progression/ledger", headers=headers).json() == entries


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


def test_runner_can_correct_recap_tone_and_clear_story_memory(client, db_session):
    headers = register_and_auth(client, "story-feedback@jogmania.com")
    response = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 21, 9, 0, tzinfo=timezone.utc),
            duration_s=1200,
            distance_m=2400,
        ),
        headers=headers,
    )
    assert response.status_code == 200
    session_id = response.json()["raw_payload_json"]["adventure_session_id"]

    feedback = client.post(
        f"/adventure/sessions/{session_id}/feedback",
        json={"felt_personal": False, "style_correction": "more_grounded"},
        headers=headers,
    )
    assert feedback.status_code == 200
    profile = client.get("/adventure/profile", headers=headers).json()
    assert profile["preferences"]["story_feedback"] == "more_grounded"
    assert db_session.query(RunnerFeedback).count() == 1

    cleared = client.delete("/adventure/profile", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["cleared"] is True
    assert db_session.query(RunnerFeedback).count() == 0


def test_a_long_wander_unlocks_a_level_without_using_pace_or_health(client):
    headers = register_and_auth(client, "level-up@jogmania.com")
    route_id = client.get("/parties", headers=headers).json()[0]["world"]["route_id"]
    run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 22, 8, 0, tzinfo=timezone.utc),
            duration_s=5400,
            distance_m=10800,
            route_id=route_id,
            avg_hr=None,
        ),
        headers=headers,
    )
    assert run.status_code == 200
    progression = run.json()["raw_payload_json"]["progression"]
    assert progression["points"] == 600
    assert progression["level"] == 2
    assert "arcade-level-up" in progression["rewards"]
    assert run.json()["avg_hr"] is None
    reward_types = {item["type"] for item in client.get("/rewards", headers=headers).json()}
    assert "arcade-level-up" in reward_types


def test_party_invite_builds_an_async_shared_arcade_without_sharing_run_metrics(client):
    owner = register_and_auth(client, "arcade-owner@jogmania.com")
    owner_route = client.get("/parties", headers=owner).json()[0]["world"]["route_id"]
    created = client.post(
        "/parties",
        json={"name": "The Lantern Crew", "world_name": "Moonlight Arcade", "members": []},
        headers=owner,
    )
    assert created.status_code == 200
    shared_party = created.json()
    assert shared_party["invite_code"]
    entered = client.post(
        f"/parties/{shared_party['id']}/world/enter",
        json={"route_id": owner_route},
        headers=owner,
    )
    assert entered.status_code == 200

    pal = register_and_auth(client, "arcade-pal@jogmania.com")
    joined = client.post(
        "/parties/join",
        json={"invite_code": shared_party["invite_code"].lower(), "display_name": "Pip"},
        headers=pal,
    )
    assert joined.status_code == 200
    assert any(member["name"] == "Pip" for member in joined.json()["members"])
    assert joined.json()["world"]["route_id"] is None
    assert "course_id" not in joined.json()["world"]["state_json"]
    assert any(party["id"] == shared_party["id"] for party in client.get("/parties", headers=pal).json())

    pal_route = client.get("/parties", headers=pal).json()[0]["world"]["route_id"]
    run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 22, 9, 0, tzinfo=timezone.utc),
            duration_s=900,
            distance_m=1800,
            route_id=pal_route,
        ),
        headers=pal,
    )
    assert run.status_code == 200

    owner_party = client.get(f"/parties/{shared_party['id']}", headers=owner).json()
    project = owner_party["world"]["state_json"]["arcade"]["project"]
    assert project["runs"] == 1
    assert project["target_runs"] == 12
    events = client.get(f"/parties/{shared_party['id']}/world/events", headers=owner).json()
    assert len(events) == 1
    assert "workout_id" not in events[0]
    assert "score" not in events[0]["payload_json"]
    assert "shared_project" in events[0]["payload_json"]

    left = client.delete(f"/parties/{shared_party['id']}/leave", headers=pal)
    assert left.status_code == 200
    assert not any(party["id"] == shared_party["id"] for party in client.get("/parties", headers=pal).json())


@pytest.mark.anyio
async def test_story_outbox_enriches_a_deterministic_postcard_after_workout_save(
    client,
    db_session,
    monkeypatch,
):
    from app.api.routes import workouts as workout_routes
    from app.services import adventure_play as adventure_play_service
    from app.services.story_outbox import process_story_job_batch

    monkeypatch.setattr(workout_routes.settings, "mastra_url", "http://mastra.test")
    monkeypatch.setattr(workout_routes.settings, "mastra_internal_token", "test-token")

    async def fake_mastra(path, payload):
        if path == "/v1/recap":
            return {
                "recapHeadline": "The arcade knows the way",
                "recapStory": "Your familiar trail brought one more bright light home.",
                "evidenceId": "course-discovery",
                "nextHook": "A brass bell is ringing by the prize tin.",
            }
        return None

    monkeypatch.setattr(adventure_play_service, "_mastra", fake_mastra)
    headers = register_and_auth(client, "outbox@jogmania.com")
    run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 23, 8, 0, tzinfo=timezone.utc),
            duration_s=1200,
            distance_m=2400,
        ),
        headers=headers,
    )
    assert run.status_code == 200
    session_id = run.json()["raw_payload_json"]["adventure_session_id"]
    assert run.json()["raw_payload_json"]["adventure_recap"]["intelligence"] == "fallback"
    assert db_session.query(StoryJob).filter_by(adventure_session_id=UUID(session_id)).count() == 1

    completed = await process_story_job_batch(db_session)
    assert completed == 1
    db_session.expire_all()
    session = db_session.query(AdventureSession).filter_by(id=UUID(session_id)).one()
    job = db_session.query(StoryJob).filter_by(adventure_session_id=UUID(session_id)).one()
    assert job.status == "complete"
    assert session.recap_json["intelligence"] == "mastra"
    assert session.recap_json["evidence_id"] == "course-discovery"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("model_output", "expected_intelligence"),
    [
        (
            {
                "recapHeadline": "The trail's secret hello",
                "recapStory": "This new path has a tiny postbox now.",
                "evidenceId": "invented-favorite-course",
                "nextHook": "A paper bird is peeking out.",
            },
            "fallback",
        ),
        (
            {
                "recapHeadline": "The trail's secret hello",
                "recapStory": "Run faster next time to earn more lights.",
                "evidenceId": "run-complete",
                "nextHook": "A paper bird is peeking out.",
            },
            "mastra",
        ),
    ],
)
async def test_golden_run_story_rejects_unsupported_claims_and_pressure(
    client,
    db_session,
    monkeypatch,
    model_output,
    expected_intelligence,
):
    from app.services import adventure_play as adventure_play_service

    captured_payloads = []

    async def fake_mastra(path, payload):
        captured_payloads.append((path, payload))
        return model_output

    monkeypatch.setattr(adventure_play_service, "_mastra", fake_mastra)
    headers = register_and_auth(client, f"golden-{expected_intelligence}-{model_output['evidenceId']}@jogmania.com")
    route_id = client.get("/parties", headers=headers).json()[0]["world"]["route_id"]
    run = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 24, 8, 0, tzinfo=timezone.utc),
            duration_s=1200,
            distance_m=2400,
            route_id=route_id,
            avg_hr=None,
        ),
        headers=headers,
    )
    assert run.status_code == 200
    session_id = UUID(run.json()["raw_payload_json"]["adventure_session_id"])
    session = db_session.query(AdventureSession).filter_by(id=session_id).one()
    workout = db_session.query(Workout).filter_by(id=UUID(run.json()["id"])).one()
    route = db_session.query(Route).filter_by(id=UUID(route_id)).one()

    recap = await adventure_play_service.build_recap(
        db_session,
        session=session,
        workout=workout,
        route=route,
        event_log=session.event_log_json or [],
    )

    assert recap["intelligence"] == expected_intelligence
    assert recap["story"] == run.json()["raw_payload_json"]["adventure_recap"]["story"]
    assert all("heart_rate" not in str(payload).lower() and "calorie" not in str(payload).lower() for _, payload in captured_payloads)


def test_watch_workout_adventure_uses_course_shape_not_hr_samples(client):
    headers = register_and_auth(client, "watch-signals@jogmania.com")
    started_at = datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc)
    payload = workout_payload(
        started_at=started_at,
        duration_s=600,
        distance_m=1100,
        source="watch",
        device_id="watch-signals",
        companion_device_id="ios-signals",
    )
    track = [
        (37.7800, -122.4200, 10, 0),
        (37.7810, -122.4200, 18, 60),
        (37.7810, -122.4184, 44, 120),
        (37.7822, -122.4184, 50, 195),
        (37.7830, -122.4171, 52, 240),
    ]
    payload["gps_points"] = [
        {
            "lat": lat,
            "lon": lon,
            "altitude_m": altitude,
            "timestamp": (started_at + timedelta(seconds=offset)).isoformat(),
            "accuracy_m": 5,
        }
        for lat, lon, altitude, offset in track
    ]
    payload["raw_payload_json"]["heart_rate_samples"] = [
        {
            "bpm": 138,
            "timestamp": (started_at + timedelta(seconds=45)).isoformat(),
            "distance_m": 110,
        },
        {
            "bpm": 181,
            "timestamp": (started_at + timedelta(seconds=145)).isoformat(),
            "distance_m": 310,
        },
    ]

    response = client.post("/workouts", json=payload, headers=headers)
    assert response.status_code == 200

    adventure = client.get(
        f"/adventures/by-workout/{response.json()['id']}",
        headers=headers,
    )
    assert adventure.status_code == 200
    summary = adventure.json()
    features = summary["route_features"]
    assert features["climb_count"] >= 1
    assert features["turn_count"] >= 1
    assert "high_hr_moments" not in features
    assert {layer["kind"] for layer in summary["map_layers"]} == {"climb", "turn"}


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


def test_workout_progress_is_per_user_and_grants_run_rewards(client):
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
    assert "run-complete" in reward_types
    assert "course-discovered" in reward_types

    inventory_items = {item["item_key"]: item["quantity"] for item in client.get("/inventory", headers=user_one).json()}
    assert inventory_items["arcade-token"] > 5
    assert "speed-rune" not in inventory_items

    user_two = register_and_auth(client, "user-two@jogmania.com")
    other_user_view = client.get(f"/workouts/{second_run.json()['id']}", headers=user_two)
    assert other_user_view.status_code == 404


def test_any_course_run_autoplays_default_world(client, db_session):
    headers = register_and_auth(client, "story@jogmania.com")
    party = client.get("/parties", headers=headers).json()[0]
    selected_route = party["world"]["route_id"]
    another_course = next(
        route["id"]
        for route in client.get("/routes", headers=headers).json()
        if route["id"] != selected_route
    )

    response = client.post(
        "/workouts",
        json=workout_payload(
            started_at=datetime(2026, 3, 21, 8, 0, tzinfo=timezone.utc),
            duration_s=1320,
            distance_m=2800,
            route_id=another_course,
            device_id="ios-story",
        ),
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["route_id"] == another_course
    assert db_session.query(Party).count() == 1
    assert db_session.query(WorldEvent).count() == 1

    events = client.get(f"/parties/{party['id']}/world/events", headers=headers)
    assert events.status_code == 200
    assert len(events.json()) == 1
    assert "workout_id" not in events.json()[0]
    assert "shared_project" in events.json()[0]["payload_json"]
