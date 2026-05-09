from __future__ import annotations

import io
import os

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.db import DATABASE_URL
from app.db.migrate import run_migrations
from app.main import app


def _can_connect() -> bool:
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:  # pragma: no cover - best effort check
        return False


def test_workstream_save_recognize_run() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")

    run_migrations()

    with TestClient(app) as client:
        files = {
            "file": (
                "known.csv",
                io.BytesIO(b"invoice_date,region,revenue\n2024-01-01,NE,100\n2024-01-02,SE,200\n"),
                "text/csv",
            )
        }
        upload = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            files=files,
        )
        assert upload.status_code == 201
        dataset_id = upload.json()["dataset_id"]

        steps = [
            {"type": "normalize_dates", "column": "invoice_date"},
            {"type": "map_values", "column": "region", "map": "region_aliases"},
            {"type": "filter", "expr": '"revenue" IS NOT NULL'},
        ]
        created = client.post(
            "/workstreams",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            json={
                "dataset_id": dataset_id,
                "name": "Revenue Crack",
                "description": "known vendor feed",
                "steps": steps,
            },
        )
        assert created.status_code == 201
        workstream_id = created.json()["workstream_id"]

        listed = client.get(
            "/workstreams",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
        )
        assert listed.status_code == 200
        assert any(ws["workstream_id"] == workstream_id for ws in listed.json()["workstreams"])

        recognize = client.post(
            "/workstreams/recognize",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            json={"dataset_id": dataset_id, "min_score": 0.5, "limit": 3},
        )
        assert recognize.status_code == 200
        matches = recognize.json()["matches"]
        assert matches
        assert matches[0]["workstream_id"] == workstream_id

        recommend = client.post(
            "/workstreams/recommend",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            json={"dataset_id": dataset_id, "limit": 4},
        )
        assert recommend.status_code == 200
        recommendations = recommend.json()["recommendations"]
        assert recommendations
        assert recommendations[0]["recommendation_id"] == "rec_revenue_cleanup"

        run = client.post(
            f"/workstreams/{workstream_id}/run",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            json={"dataset_id": dataset_id},
        )
        assert run.status_code == 200
        assert run.json()["status"] == "completed"
        assert run.json()["output_version_id"]

        forbidden = client.post(
            f"/workstreams/{workstream_id}/run",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_bob"},
            json={"dataset_id": dataset_id},
        )
        assert forbidden.status_code == 403
