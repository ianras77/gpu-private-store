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
    except Exception:  # pragma: no cover
        return False


def test_preview_basic_select() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    content = b"a,b\n1,2\n3,4\n"
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    with TestClient(app) as client:
        ds_resp = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
    assert ds_resp.status_code == 201
    dataset_id = ds_resp.json()["dataset_id"]

    spec = {
        "target_columns": [
            {"target": "a", "source": ["a"], "transform": [], "confidence": 1.0, "evidence": []},
            {"target": "b", "source": ["b"], "transform": [], "confidence": 1.0, "evidence": []},
        ],
        "unmapped_source_columns": [],
        "unfilled_target_columns": [],
        "warnings": [],
    }

    with TestClient(app) as client:
        resp = client.post(
            "/previews",
            headers={"X-API-Key": "local-dev-key"},
            json={"dataset_id": dataset_id, "spec": spec},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["before_rows"] == 2
    assert body["after_rows"] == 2
