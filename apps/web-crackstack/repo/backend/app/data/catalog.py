from __future__ import annotations

from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

from app.db import get_conn


def ensure_tenant(tenant_id: str) -> None:
    with get_conn(tenant_id) as conn:
        conn.execute(
            "INSERT INTO tenants (tenant_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (tenant_id,),
        )


def get_dataset(tenant_id: str, dataset_id: str) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        return conn.execute(
            """
            SELECT dataset_id, name, description, created_at, latest_version_id
            FROM datasets
            WHERE dataset_id = %s
            """,
            (dataset_id,),
        ).fetchone()


def list_datasets(tenant_id: str) -> list[dict[str, Any]]:
    with get_conn(tenant_id) as conn:
        rows = conn.execute(
            """
            SELECT d.dataset_id,
                   d.name,
                   d.description,
                   v.row_count
            FROM datasets d
            LEFT JOIN dataset_versions v
              ON v.tenant_id = d.tenant_id
             AND v.dataset_id = d.dataset_id
             AND v.version_id = d.latest_version_id
            ORDER BY d.created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def create_dataset(
    tenant_id: str,
    dataset_id: str,
    name: str,
    description: str | None,
    latest_version_id: str | None,
) -> None:
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO datasets (tenant_id, dataset_id, name, description, latest_version_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, dataset_id) DO NOTHING
            """,
            (tenant_id, dataset_id, name, description, latest_version_id),
        )


def update_dataset_latest_version(
    tenant_id: str,
    dataset_id: str,
    latest_version_id: str,
) -> None:
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            UPDATE datasets
            SET latest_version_id = %s
            WHERE dataset_id = %s
            """,
            (latest_version_id, dataset_id),
        )


def create_version(
    tenant_id: str,
    dataset_id: str,
    version_id: str,
    path: str,
    row_count: int,
    schema: list[dict[str, Any]] | None,
    recipe_name: str | None = None,
    source_type: str | None = None,
    original_filename: str | None = None,
    storage_key: str | None = None,
) -> None:
    payload_schema = Json(schema) if schema is not None else None
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO dataset_versions (
                tenant_id,
                dataset_id,
                version_id,
                path,
                storage_key,
                row_count,
                schema,
                recipe_name,
                source_type,
                original_filename
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, dataset_id, version_id) DO NOTHING
            """,
            (
                tenant_id,
                dataset_id,
                version_id,
                path,
                storage_key,
                row_count,
                payload_schema,
                recipe_name,
                source_type,
                original_filename,
            ),
        )


def update_version_schema(
    tenant_id: str,
    dataset_id: str,
    version_id: str,
    schema: list[dict[str, Any]],
) -> None:
    payload_schema = Json(schema)
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            UPDATE dataset_versions
            SET schema = %s
            WHERE dataset_id = %s AND version_id = %s
            """,
            (payload_schema, dataset_id, version_id),
        )


def get_latest_version(tenant_id: str, dataset_id: str) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            SELECT v.*
            FROM dataset_versions v
            JOIN datasets d
              ON d.tenant_id = v.tenant_id
             AND d.dataset_id = v.dataset_id
            WHERE d.dataset_id = %s
              AND v.version_id = d.latest_version_id
            """,
            (dataset_id,),
        ).fetchone()
        if row:
            return dict(row)

        row = conn.execute(
            """
            SELECT v.*
            FROM dataset_versions v
            WHERE v.dataset_id = %s
            ORDER BY v.created_at DESC
            LIMIT 1
            """,
            (dataset_id,),
        ).fetchone()
        return dict(row) if row else None


def count_versions(tenant_id: str, dataset_id: str) -> int:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM dataset_versions
            WHERE dataset_id = %s
            """,
            (dataset_id,),
        ).fetchone()
        return int(row["count"]) if row else 0


def create_template(
    tenant_id: str,
    template_id: str,
    filename: str,
    storage_key: str | None,
    schema: dict[str, Any],
) -> None:
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO templates (tenant_id, template_id, filename, storage_key, schema)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, template_id) DO UPDATE
            SET filename = EXCLUDED.filename,
                storage_key = EXCLUDED.storage_key,
                schema = EXCLUDED.schema
            """,
            (tenant_id, template_id, filename, storage_key, Json(schema)),
        )


def get_template(tenant_id: str, template_id: str) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            SELECT template_id, filename, storage_key, schema, created_at
            FROM templates
            WHERE template_id = %s
            """,
            (template_id,),
        ).fetchone()
        return dict(row) if row else None


def list_templates(tenant_id: str) -> list[dict[str, Any]]:
    with get_conn(tenant_id) as conn:
        rows = conn.execute(
            """
            SELECT template_id, filename, storage_key, created_at
            FROM templates
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def upsert_profile(
    tenant_id: str,
    dataset_id: str,
    version_id: str,
    profile: dict[str, Any],
    sample_rows: list[dict[str, Any]] | None = None,
) -> None:
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO dataset_profiles (tenant_id, dataset_id, version_id, profile, sample_rows)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (tenant_id, dataset_id, version_id)
            DO UPDATE SET profile = EXCLUDED.profile, sample_rows = EXCLUDED.sample_rows
            """,
            (
                tenant_id,
                dataset_id,
                version_id,
                Json(profile),
                Json(sample_rows) if sample_rows else None,
            ),
        )


def get_profile(
    tenant_id: str,
    dataset_id: str,
    version_id: str | None = None,
) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        if version_id:
            row = conn.execute(
                """
                SELECT p.profile, p.sample_rows
                FROM dataset_profiles p
                WHERE p.dataset_id = %s
                  AND p.version_id = %s
                ORDER BY p.created_at DESC
                LIMIT 1
                """,
                (dataset_id, version_id),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT p.profile, p.sample_rows
                FROM dataset_profiles p
                WHERE p.dataset_id = %s
                ORDER BY p.created_at DESC
                LIMIT 1
                """,
                (dataset_id,),
            ).fetchone()
        if not row:
            return None
        profile = dict(row["profile"])
        if row.get("sample_rows") is not None:
            profile["sample_rows"] = row["sample_rows"]
        return profile


def upsert_user_profile(
    tenant_id: str,
    user_id: str,
    display_name: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            INSERT INTO user_profiles (tenant_id, user_id, display_name, metadata)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (tenant_id, user_id)
            DO UPDATE SET
                display_name = EXCLUDED.display_name,
                metadata = COALESCE(EXCLUDED.metadata, user_profiles.metadata),
                updated_at = now()
            RETURNING user_id, display_name, metadata, created_at, updated_at
            """,
            (
                tenant_id,
                user_id,
                display_name,
                Json(metadata) if metadata is not None else None,
            ),
        ).fetchone()
    return dict(row)


def get_user_profile(tenant_id: str, user_id: str) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            SELECT user_id, display_name, metadata, created_at, updated_at
            FROM user_profiles
            WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def create_workstream(
    tenant_id: str,
    user_id: str,
    name: str,
    description: str | None,
    recipe_steps: list[dict[str, Any]],
    match_signature: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    workstream_id = f"ws_{uuid4().hex[:12]}"
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO workstreams (
                tenant_id,
                workstream_id,
                user_id,
                name,
                description,
                recipe_steps,
                match_signature,
                metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                tenant_id,
                workstream_id,
                user_id,
                name,
                description,
                Json(recipe_steps),
                Json(match_signature),
                Json(metadata) if metadata is not None else None,
            ),
        )
    return {
        "workstream_id": workstream_id,
        "user_id": user_id,
        "name": name,
        "description": description,
        "recipe_steps": recipe_steps,
        "match_signature": match_signature,
    }


def list_workstreams(
    tenant_id: str,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    with get_conn(tenant_id) as conn:
        if user_id:
            rows = conn.execute(
                """
                SELECT workstream_id, user_id, name, description, recipe_steps,
                       match_signature, metadata, created_at, updated_at
                FROM workstreams
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT workstream_id, user_id, name, description, recipe_steps,
                       match_signature, metadata, created_at, updated_at
                FROM workstreams
                ORDER BY created_at DESC
                """
            ).fetchall()
    return [dict(row) for row in rows]


def get_workstream(
    tenant_id: str,
    workstream_id: str,
) -> dict[str, Any] | None:
    with get_conn(tenant_id) as conn:
        row = conn.execute(
            """
            SELECT workstream_id, user_id, name, description, recipe_steps,
                   match_signature, metadata, created_at, updated_at
            FROM workstreams
            WHERE workstream_id = %s
            """,
            (workstream_id,),
        ).fetchone()
    return dict(row) if row else None


def create_workstream_run(
    tenant_id: str,
    workstream_id: str,
    user_id: str,
    dataset_id: str,
    status: str,
    output_version_id: str | None = None,
) -> dict[str, Any]:
    run_id = f"wsr_{uuid4().hex[:12]}"
    with get_conn(tenant_id) as conn:
        conn.execute(
            """
            INSERT INTO workstream_runs (
                tenant_id,
                run_id,
                workstream_id,
                user_id,
                dataset_id,
                output_version_id,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                tenant_id,
                run_id,
                workstream_id,
                user_id,
                dataset_id,
                output_version_id,
                status,
            ),
        )
    return {
        "run_id": run_id,
        "workstream_id": workstream_id,
        "dataset_id": dataset_id,
        "output_version_id": output_version_id,
        "status": status,
    }
