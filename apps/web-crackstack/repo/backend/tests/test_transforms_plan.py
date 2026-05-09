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


def test_plan_transform_template_mode() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    # Upload dataset
    content = b"order_date,revenue,region\n2024-01-01,100,NE\n2024-01-02,120,SE\n"
    files = {"file": ("data.csv", io.BytesIO(content), "text/csv")}
    with TestClient(app) as client:
        ds_resp = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
    assert ds_resp.status_code == 201
    dataset_id = ds_resp.json()["dataset_id"]

    # Upload template
    tmpl_content = b"order_date,region,revenue\n"
    tmpl_files = {"file": ("template.csv", io.BytesIO(tmpl_content), "text/csv")}
    with TestClient(app) as client:
        tmpl_resp = client.post(
            "/templates/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=tmpl_files,
        )
    assert tmpl_resp.status_code == 201
    template_id = tmpl_resp.json()["template_id"]

    with TestClient(app) as client:
        plan = client.post(
            "/transforms/plan",
            headers={"X-API-Key": "local-dev-key"},
            json={"dataset_id": dataset_id, "mode": "template", "template_id": template_id},
        )
    assert plan.status_code == 200
    body = plan.json()
    assert body["dataset_id"] == dataset_id
    assert body["template_id"] == template_id
    assert body["mapping"]["target_columns"], "mapping should include at least one column"
