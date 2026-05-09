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


def test_upload_creates_profile() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()
    content = b"a,b\n1,2\n3,4\n"
    files = {"file": ("small.csv", io.BytesIO(content), "text/csv")}

    with TestClient(app) as client:
        resp = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
    assert resp.status_code == 201
    payload = resp.json()
    dataset_id = payload["dataset_id"]

    with TestClient(app) as client:
        prof = client.get(f"/datasets/{dataset_id}/profile", headers={"X-API-Key": "local-dev-key"})
    assert prof.status_code == 200
    body = prof.json()
    assert body["dataset_id"] == dataset_id
    assert body["tables"][0]["columns"][0]["canonical_name"]
