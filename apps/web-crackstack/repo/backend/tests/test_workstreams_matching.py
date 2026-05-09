from __future__ import annotations

from app.data import workstreams


def test_build_signature_from_profile() -> None:
    profile = {
        "tables": [
            {
                "columns": [
                    {"canonical_name": "invoice_date", "type": "date"},
                    {"canonical_name": "region", "type": "string"},
                    {"canonical_name": "revenue", "type": "float"},
                ]
            }
        ]
    }
    signature = workstreams.build_signature_from_profile(profile)
    assert signature["columns"] == ["invoice_date", "region", "revenue"]
    assert signature["types"]["invoice_date"] == "date"


def test_recognize_workstreams_orders_by_score() -> None:
    dataset_signature = {
        "columns": ["invoice_date", "region", "revenue", "notes"],
        "types": {
            "invoice_date": "date",
            "region": "string",
            "revenue": "float",
            "notes": "string",
        },
    }
    items = [
        {
            "workstream_id": "ws_low",
            "name": "Low",
            "match_signature": {
                "columns": ["region", "postal_code"],
                "types": {"region": "string", "postal_code": "string"},
            },
        },
        {
            "workstream_id": "ws_high",
            "name": "High",
            "match_signature": {
                "columns": ["invoice_date", "region", "revenue"],
                "types": {
                    "invoice_date": "date",
                    "region": "string",
                    "revenue": "float",
                },
            },
        },
    ]

    matches = workstreams.recognize_workstreams(dataset_signature, items, min_score=0.3, limit=5)

    assert [item["workstream_id"] for item in matches] == ["ws_high", "ws_low"]
    assert matches[0]["score"] > matches[1]["score"]


def test_recommend_workstream_templates_detects_revenue_cleanup() -> None:
    profile = {
        "tables": [
            {
                "columns": [
                    {"canonical_name": "invoice_date", "type": "string"},
                    {"canonical_name": "region", "type": "string"},
                    {
                        "canonical_name": "revenue",
                        "type": "float",
                        "nullable": True,
                        "stats": {"null_pct": 0.11},
                    },
                ]
            }
        ]
    }

    recommendations = workstreams.recommend_workstream_templates(profile, limit=4)

    assert recommendations
    assert recommendations[0]["recommendation_id"] == "rec_revenue_cleanup"
    assert recommendations[0]["confidence"] >= 0.9
    assert [step["type"] for step in recommendations[0]["suggested_steps"]] == [
        "normalize_dates",
        "map_values",
        "filter",
    ]
    assert "sqlserver_export" in recommendations[0]["output_targets"]


def test_recommend_workstream_templates_returns_starter_when_no_pattern() -> None:
    profile = {
        "tables": [
            {
                "columns": [
                    {"canonical_name": "id", "type": "string"},
                    {"canonical_name": "customer_name", "type": "string"},
                    {"canonical_name": "notes", "type": "string"},
                ]
            }
        ]
    }

    recommendations = workstreams.recommend_workstream_templates(profile, limit=4)

    assert recommendations
    assert recommendations[0]["recommendation_id"] == "rec_starter"
    assert recommendations[0]["suggested_steps"] == []
