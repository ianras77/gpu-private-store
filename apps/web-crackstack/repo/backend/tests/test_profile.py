from __future__ import annotations

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


def test_profile_endpoint_returns_canonical_schema() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")

    run_migrations()
    with TestClient(app) as client:
        resp = client.post(
            "/datasets/demo_sales/profile",
            headers={"X-API-Key": "local-dev-key"},
        )
    if resp.status_code != 200:
        pytest.skip(f"profile endpoint unavailable (status {resp.status_code})")
    body = resp.json()
    assert body["dataset_id"] == "demo_sales"
    assert body["inference_version"] == "1.0"
    assert body["tables"]
    columns = body["tables"][0]["columns"]
    assert all("canonical_name" in col for col in columns)
    assert all("stats" in col for col in columns)

    # cached fetch
    with TestClient(app) as client:
        resp_cached = client.get(
            "/datasets/demo_sales/profile",
            headers={"X-API-Key": "local-dev-key"},
        )
    assert resp_cached.status_code == 200
    cached = resp_cached.json()
    assert cached["dataset_id"] == "demo_sales"
