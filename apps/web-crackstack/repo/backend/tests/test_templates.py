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


def test_template_upload_csv_returns_schema() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()
    content = b"alpha,beta,gamma\n1,2,3\n"
    files = {"file": ("template.csv", io.BytesIO(content), "text/csv")}

    with TestClient(app) as client:
        resp = client.post(
            "/templates/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["template_id"].startswith("tmpl_")
    assert body["schema"]["tables"][0]["columns"][0]["canonical_name"] == "alpha"


def test_template_upload_excel_returns_schema() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    try:
        import pandas as pd  # noqa: PLC0415
    except Exception:  # pragma: no cover - optional dependency check
        pytest.skip("pandas not installed")

    df = pd.DataFrame({"Order Date": ["2024-01-01"], "Revenue": [100.0]})
    buffer = io.BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)

    files = {
        "file": (
            "template.xlsx",
            buffer,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    with TestClient(app) as client:
        resp = client.post(
            "/templates/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
    assert resp.status_code == 201
    body = resp.json()
    cols = body["schema"]["tables"][0]["columns"]
    assert {c["canonical_name"] for c in cols} == {"order_date", "revenue"}


def test_template_list_and_get_round_trip() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    files = {"file": ("template.csv", io.BytesIO(b"alpha,beta\n1,2\n"), "text/csv")}

    with TestClient(app) as client:
        upload = client.post(
            "/templates/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
        assert upload.status_code == 201
        template_id = upload.json()["template_id"]

        listed = client.get("/templates", headers={"X-API-Key": "local-dev-key"})
        assert listed.status_code == 200
        assert any(item["template_id"] == template_id for item in listed.json()["templates"])

        fetched = client.get(
            f"/templates/{template_id}",
            headers={"X-API-Key": "local-dev-key"},
        )
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["template_id"] == template_id
    assert body["filename"] == "template.csv"
    assert body["schema"]["tables"][0]["columns"][0]["canonical_name"] == "alpha"
