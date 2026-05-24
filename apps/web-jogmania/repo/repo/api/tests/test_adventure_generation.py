import pytest

from app.services.adventure_generator import build_adventure


@pytest.mark.anyio
async def test_build_adventure_maps_workout_signals_to_game_encounters():
    points = [
        {
            "lat": 37.78000,
            "lon": -122.42000,
            "altitude_m": 10,
            "timestamp": "2026-05-24T08:00:00+00:00",
        },
        {
            "lat": 37.78100,
            "lon": -122.42000,
            "altitude_m": 18,
            "timestamp": "2026-05-24T08:01:00+00:00",
        },
        {
            "lat": 37.78100,
            "lon": -122.41840,
            "altitude_m": 44,
            "timestamp": "2026-05-24T08:02:00+00:00",
        },
        {
            "lat": 37.78225,
            "lon": -122.41835,
            "altitude_m": 50,
            "timestamp": "2026-05-24T08:03:15+00:00",
        },
        {
            "lat": 37.78315,
            "lon": -122.41710,
            "altitude_m": 52,
            "timestamp": "2026-05-24T08:04:00+00:00",
        },
    ]

    summary = await build_adventure(
        points=points,
        workout={
            "distance_m": 520,
            "avg_hr": 166,
            "calories_kcal": 95,
            "elevation_gain_m": 42,
            "raw_payload_json": {
                "heart_rate_samples": [
                    {
                        "bpm": 138,
                        "timestamp": "2026-05-24T08:00:45+00:00",
                        "distance_m": 110,
                    },
                    {
                        "bpm": 181,
                        "timestamp": "2026-05-24T08:02:20+00:00",
                        "distance_m": 310,
                    },
                    {
                        "bpm": 173,
                        "timestamp": "2026-05-24T08:03:30+00:00",
                        "distance_m": 430,
                    },
                ],
                "cadence_samples": [
                    {"spm": 164, "timestamp": "2026-05-24T08:01:00+00:00"},
                    {"spm": 184, "timestamp": "2026-05-24T08:03:30+00:00"},
                ],
            },
        },
        seed=12345,
    )

    features = summary["route_features"]
    assert features["climb_count"] >= 1
    assert features["turn_count"] >= 1
    assert features["high_hr_moments"] >= 1
    assert features["pace_surge_count"] >= 1

    encounter_kinds = {encounter["kind"] for encounter in summary["encounters"]}
    assert {"climb", "turn", "heart_rate"}.issubset(encounter_kinds)

    layer_kinds = {layer["kind"] for layer in summary["map_layers"]}
    assert {"climb", "turn", "heart_rate"}.issubset(layer_kinds)

    segment_hazards = {
        hazard
        for segment in summary["segments"]
        for hazard in segment["hazards"]
    }
    assert "switchback snare" in segment_hazards
    assert "pulse gate" in segment_hazards
