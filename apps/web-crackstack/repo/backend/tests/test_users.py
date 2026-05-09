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


def test_user_signup_and_profile() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()

    with TestClient(app) as client:
        signup = client.post(
            "/users/signup",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
            json={"display_name": "Alice Analyst"},
        )
        assert signup.status_code == 200
        payload = signup.json()
        assert payload["user_id"] == "user_alice"
        assert payload["display_name"] == "Alice Analyst"
        assert payload["registered"] is True

        me = client.get(
            "/users/me",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_alice"},
        )
        assert me.status_code == 200
        me_payload = me.json()
        assert me_payload["registered"] is True
        assert me_payload["display_name"] == "Alice Analyst"

        unknown = client.get(
            "/users/me",
            headers={"X-API-Key": "local-dev-key", "X-User-Id": "user_new"},
        )
        assert unknown.status_code == 200
        unknown_payload = unknown.json()
        assert unknown_payload["registered"] is False
        assert unknown_payload["display_name"] == "user_new"
