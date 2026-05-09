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


def test_upload_dataset_csv() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()
    content = b"name,amount\nalpha,10\nbeta,20\n"
    files = {
        "file": ("sample.csv", io.BytesIO(content), "text/csv"),
    }
    data = {"name": "Sample Upload", "description": "finance test"}

    with TestClient(app) as client:
        response = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
            data=data,
        )
    assert response.status_code == 201
    payload = response.json()
    assert payload["dataset_id"].startswith("ds_")
    assert payload["row_count"] == 2

    with TestClient(app) as client:
        schema_resp = client.get(
            f"/datasets/{payload['dataset_id']}/schema",
            headers={"X-API-Key": "local-dev-key"},
        )
    assert schema_resp.status_code == 200
    schema = schema_resp.json()
    assert schema["dataset_id"] == payload["dataset_id"]
    assert {col["name"] for col in schema["columns"]} == {"name", "amount"}
