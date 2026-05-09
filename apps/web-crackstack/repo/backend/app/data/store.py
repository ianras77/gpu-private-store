from __future__ import annotations

import os
import re
import tempfile
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import duckdb

from app.data import catalog
from app.db.migrate import run_migrations

DATA_DIR = Path(os.getenv("CRACKSTACK_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
DEMO_CSV_PATH = DATA_DIR / "demo_sales.csv"

BUILTIN_MAPS: dict[str, dict[str, str]] = {
    "region_aliases": {
        "NE": "North East",
        "n.e.": "North East",
        "North East": "North East",
    },
    "standard_regions_v3": {
        "NE": "North East",
        "n.e.": "North East",
        "North East": "North East",
    },
}

SUPPORTED_STEP_TYPES = {
    "normalize_dates",
    "map_values",
    "filter",
    "rename",
    "select",
    "derive",
    "drop",
}


class DatasetNotFound(KeyError):
    pass


class UnsupportedFileType(ValueError):
    pass


class IngestError(RuntimeError):
    pass


class TemplateExtractionError(RuntimeError):
    pass


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _coerce_json(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _normalize_name(name: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z]+", "_", name).strip("_")
    return slug.lower() or name.lower()


def _duck_type_to_canonical(dtype: str) -> str:
    dt = dtype.lower()
    if "bool" in dt:
        return "bool"
    if "int" in dt or "hugeint" in dt or "bigint" in dt:
        return "int"
    if "decimal" in dt or "double" in dt or "float" in dt or "numeric" in dt:
        return "float"
    if "timestamp" in dt or "datetime" in dt:
        return "datetime"
    if "date" in dt:
        return "date"
    return "string"


def _read_excel(path: Path) -> "Any":
    try:
        import pandas as pd
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise IngestError("pandas is required to read Excel files") from exc
    try:
        return pd.read_excel(path)
    except Exception as exc:  # noqa: BLE001
        raise IngestError(f"failed to read Excel file: {path.name}") from exc


def ingest_upload(
    tenant_id: str,
    source_path: Path,
    original_filename: str,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    run_migrations()
    catalog.ensure_tenant(tenant_id)

    dataset_id = f"ds_{uuid4().hex[:12]}"
    for _ in range(4):
        if not catalog.get_dataset(tenant_id, dataset_id):
            break
        dataset_id = f"ds_{uuid4().hex[:12]}"
    else:
        raise IngestError("failed to allocate dataset id")

    dataset_name = name or Path(original_filename).stem or dataset_id
    version_id = "v1"
    dataset_dir = DATA_DIR / "tenants" / tenant_id / "datasets" / dataset_id / "versions"
    _ensure_dir(dataset_dir)
    parquet_path = dataset_dir / f"{version_id}.parquet"
    storage_key = str(parquet_path.relative_to(DATA_DIR))

    ext = Path(original_filename).suffix.lower()
    if ext in {".csv", ".txt", ".tsv"}:
        with duckdb.connect() as con:
            con.execute(
                f"COPY (SELECT * FROM read_csv_auto({_sql_literal(str(source_path))})) "
                f"TO {_sql_literal(str(parquet_path))} (FORMAT PARQUET)"
            )
        source_type = f"upload_{ext.lstrip('.')}"
    elif ext in {".xlsx", ".xls"}:
        df = _read_excel(source_path)
        try:
            df.to_parquet(parquet_path, index=False)
        except Exception as exc:  # noqa: BLE001
            raise IngestError("failed to write parquet from Excel input") from exc
        source_type = "upload_excel"
    else:
        raise UnsupportedFileType(f"unsupported file type: {ext or 'unknown'}")

    row_count = _count_rows(parquet_path)
    schema = _schema_for_path(parquet_path)

    catalog.create_dataset(
        tenant_id,
        dataset_id,
        name=dataset_name,
        description=description,
        latest_version_id=version_id,
    )
    catalog.create_version(
        tenant_id,
        dataset_id,
        version_id,
        path=str(parquet_path),
        storage_key=storage_key,
        row_count=row_count,
        schema=_schema_to_contract(schema),
        source_type=source_type,
        original_filename=original_filename,
    )

    # Generate and persist profile + sample for canonical contract
    profile_dataset(tenant_id, dataset_id)

    return {
        "dataset_id": dataset_id,
        "version_id": version_id,
        "row_count": row_count,
        "name": dataset_name,
    }


def ensure_demo_dataset(tenant_id: str) -> str:
    run_migrations()
    catalog.ensure_tenant(tenant_id)
    _ensure_dir(DATA_DIR)
    if not DEMO_CSV_PATH.exists():
        raise FileNotFoundError(f"Missing demo CSV at {DEMO_CSV_PATH}")

    dataset_id = "demo_sales"
    version_id = "v1"
    dataset_dir = DATA_DIR / "tenants" / tenant_id / "datasets" / dataset_id / "versions"
    _ensure_dir(dataset_dir)
    parquet_path = dataset_dir / f"{version_id}.parquet"
    storage_key = str(parquet_path.relative_to(DATA_DIR))

    # Always ensure the parquet/version exists even if dataset already present
    with duckdb.connect() as con:
        con.execute(
            f"COPY (SELECT * FROM read_csv_auto({_sql_literal(str(DEMO_CSV_PATH))})) "
            f"TO {_sql_literal(str(parquet_path))} (FORMAT PARQUET)"
        )

    row_count = _count_rows(parquet_path)
    schema = _schema_for_path(parquet_path)

    catalog.create_dataset(
        tenant_id,
        dataset_id,
        name="Demo Revenue Cleanup",
        description="Sample revenue export with mixed date formats.",
        latest_version_id=version_id,
    )
    catalog.create_version(
        tenant_id,
        dataset_id,
        version_id,
        path=str(parquet_path),
        storage_key=storage_key,
        row_count=row_count,
        schema=_schema_to_contract(schema),
        source_type="demo_csv",
        original_filename=DEMO_CSV_PATH.name,
    )
    catalog.update_dataset_latest_version(tenant_id, dataset_id, version_id)
    return dataset_id


def list_datasets(tenant_id: str) -> list[dict[str, Any]]:
    ensure_demo_dataset(tenant_id)
    datasets = catalog.list_datasets(tenant_id)
    return [
        {
            "dataset_id": dataset["dataset_id"],
            "name": dataset["name"],
            "description": dataset.get("description"),
            "rows": int(dataset.get("row_count") or 0),
        }
        for dataset in datasets
    ]


def _get_latest_version(tenant_id: str, dataset_id: str) -> dict[str, Any]:
    version = catalog.get_latest_version(tenant_id, dataset_id)
    if not version:
        raise DatasetNotFound(dataset_id)
    return version


def _schema_for_path(path: Path) -> list[tuple[str, str, int, int]]:
    with duckdb.connect() as con:
        describe = con.execute(
            "DESCRIBE SELECT * FROM read_parquet(?)",
            [str(path)],
        ).fetchall()

        rows = []
        for name, dtype, *_ in describe:
            nulls = con.execute(
                f"SELECT COUNT(*) FROM read_parquet(?) WHERE {_quote_ident(name)} IS NULL",
                [str(path)],
            ).fetchone()[0]
            distinct = con.execute(
                f"SELECT COUNT(DISTINCT {_quote_ident(name)}) FROM read_parquet(?)",
                [str(path)],
            ).fetchone()[0]
            rows.append((name, dtype, int(nulls), int(distinct)))
    return rows


def _count_rows(path: Path) -> int:
    with duckdb.connect() as con:
        return con.execute("SELECT COUNT(*) FROM read_parquet(?)", [str(path)]).fetchone()[0]


def _schema_to_contract(rows: list[tuple[str, str, int, int]]) -> list[dict[str, Any]]:
    schema = []
    for name, dtype, nulls, distinct in rows:
        schema.append(
            {
                "name": name,
                "canonical_name": _normalize_name(name),
                "type": _duck_type_to_canonical(dtype),
                "nullable": nulls > 0,
                "example_values": [],
                "stats": {"null_pct": 0.0, "unique": int(distinct)},
            }
        )
    return schema


def get_schema(tenant_id: str, dataset_id: str) -> list[dict[str, Any]]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    schema = version.get("schema")
    if schema:
        return schema
    schema = _schema_for_path(Path(version["path"]))
    catalog.update_version_schema(tenant_id, dataset_id, version["version_id"], schema)
    return schema


def sample_rows(tenant_id: str, dataset_id: str, limit: int = 5) -> list[dict[str, Any]]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    path = Path(version["path"])
    with duckdb.connect() as con:
        result = con.execute(
            "SELECT * FROM read_parquet(?) LIMIT ?",
            [str(path), int(limit)],
        )
        columns = [desc[0] for desc in result.description]
        rows = []
        for row in result.fetchall():
            coerced = [_coerce_json(val) for val in row]
            rows.append(dict(zip(columns, coerced, strict=False)))
        return rows


def profile_columns(tenant_id: str, dataset_id: str) -> list[dict[str, Any]]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    path = Path(version["path"])
    with duckdb.connect() as con:
        columns = con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(path)]).fetchall()
        profiles = []
        for name, *_ in columns:
            nulls = con.execute(
                f"SELECT COUNT(*) FROM read_parquet(?) WHERE {_quote_ident(name)} IS NULL",
                [str(path)],
            ).fetchone()[0]
            top_values = con.execute(
                f"SELECT {_quote_ident(name)}, COUNT(*) as c "
                f"FROM read_parquet(?) "
                f"WHERE {_quote_ident(name)} IS NOT NULL "
                f"GROUP BY {_quote_ident(name)} ORDER BY c DESC LIMIT 3",
                [str(path)],
            ).fetchall()
            profiles.append(
                {
                    "name": name,
                    "nulls": int(nulls),
                    "top_values": [(str(value), int(count)) for value, count in top_values],
                }
            )
        return profiles


def profile_dataset(tenant_id: str, dataset_id: str) -> dict[str, Any]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    path = Path(version["path"])
    row_count = version.get("row_count") or _count_rows(path)

    columns: list[dict[str, Any]] = []
    with duckdb.connect() as con:
        describe = _schema_for_path(path)
        for name, dtype, nulls, distinct in describe:
            example_rows = con.execute(
                f"SELECT {_quote_ident(name)} FROM read_parquet(?) "
                f"WHERE {_quote_ident(name)} IS NOT NULL LIMIT 3",
                [str(path)],
            ).fetchall()
            example_values = [str(row[0]) for row in example_rows if row and row[0] is not None]
            stats: dict[str, Any] = {
                "null_pct": round((nulls / row_count) * 100, 2) if row_count else 0.0,
                "unique": int(distinct),
            }
            if (
                "int" in dtype.lower()
                or "decimal" in dtype.lower()
                or "double" in dtype.lower()
                or "float" in dtype.lower()
            ):
                min_val, max_val = con.execute(
                    f"SELECT MIN({_quote_ident(name)}), MAX({_quote_ident(name)}) "
                    f"FROM read_parquet(?)",
                    [str(path)],
                ).fetchone()
                stats["min"] = float(min_val) if min_val is not None else None
                stats["max"] = float(max_val) if max_val is not None else None
            elif "date" in dtype.lower() or "time" in dtype.lower():
                min_val, max_val = con.execute(
                    f"SELECT MIN({_quote_ident(name)}), MAX({_quote_ident(name)}) "
                    f"FROM read_parquet(?)",
                    [str(path)],
                ).fetchone()
                stats["min"] = str(min_val) if min_val is not None else None
                stats["max"] = str(max_val) if max_val is not None else None

            columns.append(
                {
                    "name": name,
                    "canonical_name": _normalize_name(name),
                    "type": _duck_type_to_canonical(dtype),
                    "nullable": nulls > 0,
                    "example_values": example_values,
                    "stats": stats,
                }
            )

    profile = {
        "dataset_id": dataset_id,
        "version_id": version["version_id"],
        "row_count": int(row_count),
        "tables": [
            {
                "name": "default",
                "columns": columns,
                "primary_key_candidates": [],
                "notes": [],
            }
        ],
        "inference_version": "1.0",
    }

    sample = sample_rows(tenant_id, dataset_id, limit=5)
    catalog.upsert_profile(
        tenant_id,
        dataset_id,
        version["version_id"],
        profile=profile,
        sample_rows=sample,
    )
    return profile


def validate_recipe_steps(steps: list[dict[str, Any]]) -> list[str]:
    warnings = []
    for step in steps:
        step_type = step.get("type")
        if step_type not in SUPPORTED_STEP_TYPES:
            warnings.append(f"Unsupported step type: {step_type}")
    if not steps:
        warnings.append("No steps provided.")
    return warnings


def get_profile(tenant_id: str, dataset_id: str) -> dict[str, Any]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    cached = catalog.get_profile(tenant_id, dataset_id, version["version_id"])
    if cached:
        return cached
    return profile_dataset(tenant_id, dataset_id)


def extract_template_schema(
    tenant_id: str,
    template_id: str,
    path: Path,
    filename: str,
) -> tuple[dict[str, Any], str]:
    ext = path.suffix.lower()
    storage_key = str(path.relative_to(DATA_DIR))

    try:
        if ext in {".csv", ".txt", ".tsv"}:
            with duckdb.connect() as con:
                rows = con.execute(
                    "DESCRIBE SELECT * FROM read_csv_auto(?)",
                    [str(path)],
                ).fetchall()
                contract = _schema_to_contract([(name, dtype, 0, 0) for name, dtype, *_ in rows])
        elif ext in {".xlsx", ".xls"}:
            try:
                import pandas as pd  # noqa: PLC0415
            except ImportError as exc:  # pragma: no cover - runtime import
                raise TemplateExtractionError("pandas is required to read Excel templates") from exc
            try:
                df = pd.read_excel(path, nrows=50)
            except Exception as exc:  # noqa: BLE001
                raise TemplateExtractionError(f"failed to read Excel template: {filename}") from exc
            rows = []
            for col in df.columns:
                dtype = str(df[col].dtype)
                rows.append((str(col), dtype, 0, df[col].nunique()))
            contract = _schema_to_contract(rows)
        else:
            raise TemplateExtractionError(f"unsupported template file type: {ext or 'unknown'}")
    except TemplateExtractionError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise TemplateExtractionError("failed to extract template schema") from exc

    schema = {
        "tables": [
            {
                "name": "template",
                "columns": contract,
                "primary_key_candidates": [],
                "notes": [],
            }
        ],
        "inference_version": "1.0",
    }

    catalog.create_template(
        tenant_id=tenant_id,
        template_id=template_id,
        filename=filename,
        storage_key=storage_key,
        schema=schema,
    )
    return schema, storage_key


def preview_recipe(tenant_id: str, dataset_id: str, steps: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    path = Path(version["path"])
    base_query = f"SELECT * FROM read_parquet({_sql_literal(str(path))})"
    query = _apply_steps(base_query, steps)
    with duckdb.connect() as con:
        before_count = con.execute(
            "SELECT COUNT(*) FROM read_parquet(?)",
            [str(path)],
        ).fetchone()[0]
        after_count = con.execute(f"SELECT COUNT(*) FROM ({query})").fetchone()[0]

    row_delta = 0.0
    if before_count:
        row_delta = (after_count - before_count) / before_count * 100

    return {
        "before_rows": int(before_count),
        "after_rows": int(after_count),
        "row_delta_pct": round(row_delta, 2),
    }


def run_recipe(
    tenant_id: str,
    dataset_id: str,
    steps: list[dict[str, Any]],
    recipe_name: str | None = None,
) -> dict[str, Any]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    path = Path(version["path"])

    base_query = f"SELECT * FROM read_parquet({_sql_literal(str(path))})"
    query = _apply_steps(base_query, steps)

    version_id = f"v{catalog.count_versions(tenant_id, dataset_id) + 1}"
    dataset_dir = DATA_DIR / "tenants" / tenant_id / "datasets" / dataset_id / "versions"
    _ensure_dir(dataset_dir)
    output_path = dataset_dir / f"{version_id}.parquet"
    storage_key = str(output_path.relative_to(DATA_DIR))

    with duckdb.connect() as con:
        con.execute(
            f"COPY ({query}) TO {_sql_literal(str(output_path))} (FORMAT PARQUET)"
        )

    row_count = _count_rows(output_path)
    schema = _schema_for_path(output_path)

    catalog.create_version(
        tenant_id,
        dataset_id,
        version_id,
        path=str(output_path),
        storage_key=storage_key,
        row_count=row_count,
        schema=_schema_to_contract(schema),
        recipe_name=recipe_name,
        source_type="recipe",
    )
    catalog.update_dataset_latest_version(tenant_id, dataset_id, version_id)

    return {
        "dataset_id": dataset_id,
        "version_id": version_id,
        "row_count": row_count,
    }


def download_latest_csv(tenant_id: str, dataset_id: str) -> dict[str, Any]:
    ensure_demo_dataset(tenant_id)
    version = _get_latest_version(tenant_id, dataset_id)
    parquet_path = Path(version["path"])
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        with duckdb.connect() as con:
            con.execute(
                f"COPY (SELECT * FROM read_parquet(?)) "
                f"TO {_sql_literal(str(tmp_path))} (HEADER, DELIMITER ',')",
                [str(parquet_path)],
            )
        content = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)
    row_count = version.get("row_count")
    if row_count is None:
        row_count = _count_rows(parquet_path)
    return {
        "dataset_id": dataset_id,
        "version_id": version["version_id"],
        "row_count": int(row_count),
        "content": content,
    }


def _apply_steps(query: str, steps: list[dict[str, Any]]) -> str:
    current = query
    for step in steps:
        step_type = step.get("type")
        if step_type == "normalize_dates":
            column = step.get("column")
            if not column:
                continue
            col = _quote_ident(column)
            formats = ["%Y-%m-%d", "%m/%d/%y", "%m/%d/%Y", "%d %b %Y", "%m-%d-%Y"]
            casts = ", ".join(
                f"try_strptime({col}, '{fmt}')" for fmt in formats
            )
            expr = f"CAST(COALESCE({casts}) AS DATE)"
            current = (
                f"SELECT * EXCLUDE({col}), {expr} AS {col} FROM ({current})"
            )
        elif step_type == "map_values":
            column = step.get("column")
            if not column:
                continue
            mapping = step.get("map") or {}
            if isinstance(mapping, str):
                mapping = BUILTIN_MAPS.get(mapping, {})
            col = _quote_ident(column)
            cases = " ".join(
                f"WHEN {col} = {_sql_literal(str(src))} THEN {_sql_literal(str(dst))}"
                for src, dst in mapping.items()
            )
            expr = f"CASE {cases} ELSE {col} END"
            current = (
                f"SELECT * EXCLUDE({col}), {expr} AS {col} FROM ({current})"
            )
        elif step_type == "filter":
            expr = step.get("expr")
            if expr:
                current = f"SELECT * FROM ({current}) WHERE {expr}"
        elif step_type == "rename":
            source = step.get("from")
            target = step.get("to")
            if source and target:
                source_q = _quote_ident(source)
                target_q = _quote_ident(target)
                current = (
                    f"SELECT * EXCLUDE({source_q}), {source_q} AS {target_q} FROM ({current})"
                )
        elif step_type == "select":
            columns = step.get("columns") or []
            if columns:
                cols = ", ".join(_quote_ident(col) for col in columns)
                current = f"SELECT {cols} FROM ({current})"
        elif step_type == "derive":
            expr = step.get("expr")
            target = step.get("as")
            if expr and target:
                target_q = _quote_ident(target)
                current = f"SELECT *, ({expr}) AS {target_q} FROM ({current})"
        elif step_type == "drop":
            columns = step.get("columns") or []
            if columns:
                cols = ", ".join(_quote_ident(col) for col in columns)
                current = f"SELECT * EXCLUDE({cols}) FROM ({current})"
    return current
