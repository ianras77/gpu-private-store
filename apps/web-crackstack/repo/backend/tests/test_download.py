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


def test_download_latest_dataset_csv() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    with TestClient(app) as client:
        files = {
            "file": (
                "sample.csv",
                io.BytesIO(b"name,amount\nalpha,10\nbeta,20\n"),
                "text/csv",
            )
        }
        upload = client.post(
            "/datasets/upload",
            headers={"X-API-Key": "local-dev-key"},
            files=files,
        )
        assert upload.status_code == 201
        dataset_id = upload.json()["dataset_id"]

        download = client.get(
            f"/datasets/{dataset_id}/download",
            headers={"X-API-Key": "local-dev-key"},
        )
        assert download.status_code == 200
        assert "text/csv" in download.headers.get("content-type", "")
        assert "attachment;" in download.headers.get("content-disposition", "")
        content = download.content.decode("utf-8")
        assert "name,amount" in content
        assert "alpha,10" in content
