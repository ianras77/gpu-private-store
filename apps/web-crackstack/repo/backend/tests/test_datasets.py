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


def test_list_datasets_returns_demo() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()
    with TestClient(app) as client:
        response = client.get("/datasets", headers={"X-API-Key": "local-dev-key"})
    assert response.status_code == 200
    payload = response.json()
    dataset_ids = {dataset["dataset_id"] for dataset in payload["datasets"]}
    assert "demo_sales" in dataset_ids
