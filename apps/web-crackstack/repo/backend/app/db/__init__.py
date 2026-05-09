from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://crackstack:crackstack@127.0.0.1:3206/crackstack",
)
DB_ROLE = os.getenv("CRACKSTACK_DB_ROLE", "crackstack_app")
DB_CONNECT_TIMEOUT = int(os.getenv("CRACKSTACK_DB_CONNECT_TIMEOUT", "5"))


def _connect() -> psycopg.Connection:
    cwd = os.getcwd()
    try:
        os.chdir("/")
        try:
            conn = psycopg.connect(DATABASE_URL, connect_timeout=DB_CONNECT_TIMEOUT)
        except Exception:
            parsed = urlparse(DATABASE_URL)
            conn = psycopg.connect(
                dbname=(parsed.path or "/").lstrip("/"),
                user=parsed.username,
                password=parsed.password,
                host=parsed.hostname or "127.0.0.1",
                port=parsed.port or 5432,
                connect_timeout=DB_CONNECT_TIMEOUT,
            )
    finally:
        os.chdir(cwd)
    conn.row_factory = dict_row
    return conn


@contextmanager
def get_conn(tenant_id: str | None = None) -> Iterator[psycopg.Connection]:
    conn = _connect()
    try:
        if DB_ROLE:
            conn.execute(f"SET ROLE {DB_ROLE}")
        if tenant_id:
            conn.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_id,))
        yield conn
        conn.commit()
    finally:
        conn.close()
