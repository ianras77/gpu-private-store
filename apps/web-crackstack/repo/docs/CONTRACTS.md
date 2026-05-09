# Contracts (Canonical Data + Mapping)
Updated: 2026-02-27

## Canonical Dataset Profile JSON
Used by `/datasets/{id}/profile` (POST to generate, GET to fetch) and as the shared schema contract across backend, web, and iOS.

```json
{
  "dataset_id": "ds_123",
  "version_id": "v1",
  "row_count": 1200,
  "tables": [
    {
      "name": "default",
      "columns": [
        {
          "name": "Order Date",
          "canonical_name": "order_date",
          "type": "date|datetime|int|float|string|bool|category",
          "nullable": true,
          "example_values": ["2024-01-02", "2024-01-03"],
          "stats": {
            "null_pct": 2.5,
            "unique": 120,
            "min": "2023-12-01",
            "max": "2024-01-31"
          }
        }
      ],
      "primary_key_candidates": [],
      "notes": []
    }
  ],
  "inference_version": "1.0",
  "sample_rows": [
    { "Order Date": "2024-01-02", "Revenue": "120.0" }
  ]
}
```

Rules:
- `canonical_name` is a lowercase slug (non-alnum → `_`, trimmed) from the source name.
- `type` is derived from DuckDB dtype: bool | int | float | date | datetime | string | category (fallback).
- `stats.null_pct` is percentage of nulls in the column; `unique` is distinct count.
- `stats.min`/`max` for numeric/date/time columns only; absent otherwise.
- `sample_rows` are limited, sanitized samples; never include more than 5 rows.

## Mapping JSON (preview)
Will be used in Stage 3 for mapping plans:

```json
{
  "target_columns": [
    {
      "target": "order_date",
      "source": ["Order Date"],
      "transform": [{"op": "parse_date", "args": {"dayfirst": false}}],
      "confidence": 0.92,
      "evidence": ["name_fuzzy=0.89", "values_look_like_date=0.97"]
    }
  ],
  "unmapped_source_columns": ["Notes"],
  "unfilled_target_columns": ["region_code"],
  "warnings": ["Revenue has mixed currency symbols"]
}
```

Guardrails:
- Every `target` must exist in the target schema.
- Every `source` must exist in the source schema.
- `transform.op` must be allowlisted; arguments are validated per op.
