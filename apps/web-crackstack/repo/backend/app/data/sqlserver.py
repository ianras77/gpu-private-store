from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.data import catalog
from app.data.store import DatasetNotFound

SQLSERVER_ENABLED = os.getenv("CRACKSTACK_SQLSERVER_ENABLED", "0") == "1"


class SqlServerExportError(RuntimeError):
    pass


def _quote_ident(name: str) -> str:
    return "[" + name.replace("]", "]]") + "]"


def _map_type(arrow_type: Any) -> str:
    try:
        import pyarrow as pa
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise SqlServerExportError("pyarrow is required for SQL Server export") from exc

    if pa.types.is_string(arrow_type) or pa.types.is_large_string(arrow_type):
        return "NVARCHAR(MAX)"
    if pa.types.is_boolean(arrow_type):
        return "BIT"
    if pa.types.is_int8(arrow_type) or pa.types.is_uint8(arrow_type):
        return "TINYINT"
    if pa.types.is_int16(arrow_type) or pa.types.is_uint16(arrow_type):
        return "SMALLINT"
    if pa.types.is_int32(arrow_type) or pa.types.is_uint32(arrow_type):
        return "INT"
    if pa.types.is_int64(arrow_type) or pa.types.is_uint64(arrow_type):
        return "BIGINT"
    if pa.types.is_float32(arrow_type):
        return "REAL"
    if pa.types.is_float64(arrow_type):
        return "FLOAT"
    if pa.types.is_date32(arrow_type) or pa.types.is_date64(arrow_type):
        return "DATE"
    if pa.types.is_timestamp(arrow_type):
        return "DATETIME2"
    if pa.types.is_decimal(arrow_type):
        return "DECIMAL(38, 10)"
    return "NVARCHAR(MAX)"


def export_latest_to_sqlserver(
    tenant_id: str,
    dataset_id: str,
    *,
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    schema: str,
    table: str,
    if_exists: str = "fail",
    batch_size: int = 10_000,
    encrypt: bool = True,
    trust_server_certificate: bool = False,
) -> dict[str, Any]:
    if not SQLSERVER_ENABLED:
        raise SqlServerExportError("SQL Server connector is disabled")

    version = catalog.get_latest_version(tenant_id, dataset_id)
    if not version:
        raise DatasetNotFound(dataset_id)

    try:
        import pyarrow.parquet as pq
        import pyodbc
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise SqlServerExportError("pyodbc and pyarrow are required for SQL Server export") from exc

    path = Path(version["path"])
    if not path.exists():
        raise SqlServerExportError("dataset parquet not found")

    connection = (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={host},{port};"
        f"DATABASE={database};"
        f"UID={username};PWD={password};"
        f"Encrypt={'yes' if encrypt else 'no'};"
        f"TrustServerCertificate={'yes' if trust_server_certificate else 'no'};"
    )

    pf = pq.ParquetFile(path)
    arrow_schema = pf.schema_arrow
    columns = [field.name for field in arrow_schema]
    column_defs = ", ".join(
        f"{_quote_ident(field.name)} {_map_type(field.type)}" for field in arrow_schema
    )

    qualified_table = f"{_quote_ident(schema)}.{_quote_ident(table)}"

    with pyodbc.connect(connection, autocommit=False) as conn:
        cursor = conn.cursor()
        cursor.fast_executemany = True

        exists = cursor.execute(
            """
            SELECT 1
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            """,
            (schema, table),
        ).fetchone()

        if exists and if_exists == "fail":
            raise SqlServerExportError("target table already exists")
        if exists and if_exists == "replace":
            cursor.execute(f"DROP TABLE {qualified_table}")
            exists = None
        if not exists:
            cursor.execute(f"CREATE TABLE {qualified_table} ({column_defs})")

        placeholders = ", ".join(["?"] * len(columns))
        insert_sql = (
            f"INSERT INTO {qualified_table} ("
            + ", ".join(_quote_ident(col) for col in columns)
            + f") VALUES ({placeholders})"
        )

        total_rows = 0
        for batch in pf.iter_batches(batch_size=batch_size):
            df = batch.to_pandas()
            df = df.where(df.notna(), None)
            rows = [tuple(row) for row in df.itertuples(index=False, name=None)]
            if rows:
                cursor.executemany(insert_sql, rows)
                total_rows += len(rows)

        conn.commit()

    return {
        "dataset_id": dataset_id,
        "version_id": version["version_id"],
        "row_count": total_rows,
        "table": table,
        "schema": schema,
    }
