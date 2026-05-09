from __future__ import annotations

from pathlib import Path

import psycopg

from app.db import DATABASE_URL

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def run_migrations() -> None:
    MIGRATIONS_DIR.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        conn.commit()

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            migration_id = path.name
            already_applied = conn.execute(
                "SELECT 1 FROM schema_migrations WHERE id = %s",
                (migration_id,),
            ).fetchone()
            if already_applied:
                continue

            sql = path.read_text()
            with conn.transaction():
                conn.execute(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (id) VALUES (%s)",
                    (migration_id,),
                )
