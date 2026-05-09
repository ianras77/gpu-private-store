from __future__ import annotations

from collections import Counter
from typing import Any

DEMO_DATASET_ID = "demo_sales_v1"

_DEMO_ROWS = [
    {
        "region": "NE",
        "invoice_date": "01/04/24",
        "revenue": 120900,
        "status": "open",
    },
    {
        "region": "North East",
        "invoice_date": "4 Jan 2024",
        "revenue": None,
        "status": "paid",
    },
    {
        "region": "n.e.",
        "invoice_date": "2024-01-04",
        "revenue": 118400,
        "status": "paid",
    },
    {
        "region": "South",
        "invoice_date": "2024-01-05",
        "revenue": 98300,
        "status": "open",
    },
    {
        "region": "West",
        "invoice_date": "01-05-2024",
        "revenue": 110750,
        "status": "paid",
    },
]


def list_datasets() -> list[dict[str, Any]]:
    return [
        {
            "dataset_id": DEMO_DATASET_ID,
            "name": "Demo Revenue Cleanup",
            "description": "Sample revenue export with mixed date formats.",
            "rows": len(_DEMO_ROWS),
        }
    ]


def get_rows(dataset_id: str) -> list[dict[str, Any]]:
    if dataset_id != DEMO_DATASET_ID:
        raise KeyError("dataset not found")
    return _DEMO_ROWS


def infer_type(values: list[Any]) -> str:
    non_null = [value for value in values if value is not None]
    if not non_null:
        return "null"
    if all(isinstance(value, int) for value in non_null):
        return "integer"
    if all(isinstance(value, (int, float)) for value in non_null):
        return "number"
    return "string"


def get_schema(dataset_id: str) -> list[dict[str, Any]]:
    rows = get_rows(dataset_id)
    columns = rows[0].keys() if rows else []
    schema = []
    for column in columns:
        values = [row.get(column) for row in rows]
        schema.append(
            {
                "name": column,
                "type": infer_type(values),
                "nulls": sum(1 for value in values if value is None),
                "distinct": len({value for value in values if value is not None}),
            }
        )
    return schema


def sample_rows(dataset_id: str, limit: int = 5) -> list[dict[str, Any]]:
    rows = get_rows(dataset_id)
    return rows[: max(limit, 0)]


def profile_columns(dataset_id: str) -> list[dict[str, Any]]:
    rows = get_rows(dataset_id)
    if not rows:
        return []
    columns = rows[0].keys()
    profiles = []
    for column in columns:
        values = [row.get(column) for row in rows]
        non_null = [value for value in values if value is not None]
        counts = Counter(non_null)
        profiles.append(
            {
                "name": column,
                "nulls": sum(1 for value in values if value is None),
                "distinct": len(counts),
                "top_values": counts.most_common(3),
            }
        )
    return profiles
