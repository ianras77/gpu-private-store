from __future__ import annotations

import os
import uuid

import psycopg
import pytest

from app.db import DATABASE_URL
from app.db.migrate import run_migrations


def _can_connect() -> bool:
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:  # pragma: no cover - best effort check
        return False


def test_rls_isolation() -> None:
    if os.getenv("CRACKSTACK_RUN_DB_TESTS") != "1":
        pytest.skip("set CRACKSTACK_RUN_DB_TESTS=1 to run DB integration tests")
    if not _can_connect():
        pytest.skip("DATABASE_URL not reachable")
    run_migrations()
    tenant_a = f"tenant_{uuid.uuid4().hex[:8]}"
    tenant_b = f"tenant_{uuid.uuid4().hex[:8]}"

    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("SET ROLE crackstack_app")
        conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_a,))
        conn.execute(
            "INSERT INTO tenants (tenant_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (tenant_a,),
        )
        conn.execute(
            """
            INSERT INTO datasets (tenant_id, dataset_id, name)
            VALUES (%s, %s, %s)
            """,
            (tenant_a, "ds_a", "Dataset A"),
        )
        conn.execute(
            """
            INSERT INTO dataset_versions (tenant_id, dataset_id, version_id, path)
            VALUES (%s, %s, %s, %s)
            """,
            (tenant_a, "ds_a", "v1", "/tmp/a.parquet"),
        )
        conn.execute(
            "UPDATE datasets SET latest_version_id = %s WHERE dataset_id = %s",
            ("v1", "ds_a"),
        )
        conn.commit()

    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("SET ROLE crackstack_app")
        conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_b,))
        conn.execute(
            "INSERT INTO tenants (tenant_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (tenant_b,),
        )
        conn.execute(
            """
            INSERT INTO datasets (tenant_id, dataset_id, name)
            VALUES (%s, %s, %s)
            """,
            (tenant_b, "ds_b", "Dataset B"),
        )
        conn.execute(
            """
            INSERT INTO dataset_versions (tenant_id, dataset_id, version_id, path)
            VALUES (%s, %s, %s, %s)
            """,
            (tenant_b, "ds_b", "v1", "/tmp/b.parquet"),
        )
        conn.execute(
            "UPDATE datasets SET latest_version_id = %s WHERE dataset_id = %s",
            ("v1", "ds_b"),
        )
        conn.commit()

    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("SET ROLE crackstack_app")
        conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_a,))
        rows = conn.execute("SELECT dataset_id FROM datasets ORDER BY dataset_id").fetchall()
        assert [row[0] for row in rows] == ["ds_a"]

        versions = conn.execute(
            "SELECT dataset_id, version_id FROM dataset_versions ORDER BY dataset_id"
        ).fetchall()
        assert [(row[0], row[1]) for row in versions] == [("ds_a", "v1")]

        update = conn.execute(
            "UPDATE datasets SET name = %s WHERE dataset_id = %s",
            ("Hacked", "ds_b"),
        )
        assert update.rowcount == 0
