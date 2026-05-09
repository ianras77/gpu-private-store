from __future__ import annotations

import os
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.data import store
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


def test_export_sqlserver_disabled() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    if os.getenv("CRACKSTACK_SQLSERVER_ENABLED") == "1":
        pytest.skip("SQL Server export enabled in environment")

    run_migrations()
    payload = {
        "host": "127.0.0.1",
        "port": 1433,
        "database": "crackstack",
        "username": "sa",
        "password": "example",
        "schema": "dbo",
        "table": "demo_sales",
    }

    with TestClient(app) as client:
        response = client.post(
            "/datasets/demo_sales/export/sqlserver",
            headers={"X-API-Key": "local-dev-key"},
            json=payload,
        )

    assert response.status_code == 503
    assert "disabled" in response.json()["detail"].lower()


def _sqlserver_config() -> dict[str, Any] | None:
    if os.getenv("CRACKSTACK_SQLSERVER_TEST_ENABLED") != "1":
        return None
    host = os.getenv("CRACKSTACK_SQLSERVER_TEST_HOST")
    database = os.getenv("CRACKSTACK_SQLSERVER_TEST_DATABASE")
    username = os.getenv("CRACKSTACK_SQLSERVER_TEST_USERNAME")
    password = os.getenv("CRACKSTACK_SQLSERVER_TEST_PASSWORD")
    if not all([host, database, username, password]):
        return None
    return {
        "host": host,
        "port": int(os.getenv("CRACKSTACK_SQLSERVER_TEST_PORT", "1433")),
        "database": database,
        "username": username,
        "password": password,
        "schema": os.getenv("CRACKSTACK_SQLSERVER_TEST_SCHEMA", "dbo"),
        "table": os.getenv("CRACKSTACK_SQLSERVER_TEST_TABLE", "crackstack_export_test"),
        "driver": os.getenv("CRACKSTACK_SQLSERVER_TEST_DRIVER", "ODBC Driver 18 for SQL Server"),
        "encrypt": os.getenv("CRACKSTACK_SQLSERVER_TEST_ENCRYPT", "1") == "1",
        "trust_cert": os.getenv("CRACKSTACK_SQLSERVER_TEST_TRUST_CERT", "0") == "1",
    }


def test_export_sqlserver_integration() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    config = _sqlserver_config()
    if not config:
        pytest.skip("SQL Server integration test not configured")
    if os.getenv("CRACKSTACK_SQLSERVER_ENABLED") != "1":
        pytest.skip("CRACKSTACK_SQLSERVER_ENABLED not set")

    try:
        import pyodbc
    except Exception:  # pragma: no cover - optional dependency
        pytest.skip("pyodbc not installed")

    run_migrations()
    store.ensure_demo_dataset("tenant_demo")

    payload = {
        "host": config["host"],
        "port": config["port"],
        "database": config["database"],
        "username": config["username"],
        "password": config["password"],
        "schema": config["schema"],
        "table": config["table"],
        "if_exists": "replace",
    }

    with TestClient(app) as client:
        response = client.post(
            "/datasets/demo_sales/export/sqlserver",
            headers={"X-API-Key": "local-dev-key"},
            json=payload,
        )
    assert response.status_code in {200, 202}
    result = response.json()
    assert result["row_count"] > 0

    connection = (
        f"DRIVER={{{config['driver']}}};"
        f"SERVER={config['host']},{config['port']};"
        f"DATABASE={config['database']};"
        f"UID={config['username']};PWD={config['password']};"
        f"Encrypt={'yes' if config['encrypt'] else 'no'};"
        f"TrustServerCertificate={'yes' if config['trust_cert'] else 'no'};"
    )
    with pyodbc.connect(connection, autocommit=True) as conn:
        cursor = conn.cursor()
        count = cursor.execute(
            f"SELECT COUNT(*) FROM [{config['schema']}].[{config['table']}]"
        ).fetchone()[0]
    assert int(count) == result["row_count"]
