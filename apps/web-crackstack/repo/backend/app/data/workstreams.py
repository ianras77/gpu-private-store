from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WorkstreamMatch:
    workstream_id: str
    name: str
    score: float
    matched_columns: int
    required_columns: int


@dataclass(frozen=True)
class WorkstreamRecommendation:
    recommendation_id: str
    name: str
    summary: str
    confidence: float
    rationale: list[str]
    suggested_steps: list[dict[str, Any]]
    output_targets: list[str]
    prompt_hint: str


def build_signature_from_profile(profile: dict[str, Any]) -> dict[str, Any]:
    tables = profile.get("tables") or []
    if not tables:
        return {"columns": [], "types": {}}

    columns = tables[0].get("columns") or []
    canonical = []
    types: dict[str, str] = {}
    for col in columns:
        canonical_name = str(col.get("canonical_name") or "").strip()
        if not canonical_name:
            continue
        canonical.append(canonical_name)
        types[canonical_name] = str(col.get("type") or "string")

    canonical_sorted = sorted(set(canonical))
    return {
        "columns": canonical_sorted,
        "types": {name: types.get(name, "string") for name in canonical_sorted},
    }


def score_signature_match(
    dataset_signature: dict[str, Any],
    workstream_signature: dict[str, Any],
) -> tuple[float, int, int]:
    dataset_cols = set(dataset_signature.get("columns") or [])
    required_cols = set(workstream_signature.get("columns") or [])
    if not required_cols:
        return 0.0, 0, 0

    matched = dataset_cols.intersection(required_cols)
    coverage = len(matched) / len(required_cols)

    dataset_types = dataset_signature.get("types") or {}
    required_types = workstream_signature.get("types") or {}
    type_matches = 0
    for col in matched:
        if required_types.get(col) == dataset_types.get(col):
            type_matches += 1

    type_score = (type_matches / len(matched)) if matched else 0.0
    score = round((coverage * 0.8) + (type_score * 0.2), 4)
    return score, len(matched), len(required_cols)


def recognize_workstreams(
    dataset_signature: dict[str, Any],
    workstreams: list[dict[str, Any]],
    *,
    min_score: float = 0.6,
    limit: int = 5,
) -> list[dict[str, Any]]:
    matches: list[WorkstreamMatch] = []
    for workstream in workstreams:
        signature = workstream.get("match_signature") or {}
        score, matched_count, required_count = score_signature_match(dataset_signature, signature)
        if score < min_score:
            continue
        matches.append(
            WorkstreamMatch(
                workstream_id=str(workstream["workstream_id"]),
                name=str(workstream.get("name") or workstream["workstream_id"]),
                score=score,
                matched_columns=matched_count,
                required_columns=required_count,
            )
        )

    matches.sort(key=lambda item: (item.score, item.matched_columns), reverse=True)
    return [
        {
            "workstream_id": item.workstream_id,
            "name": item.name,
            "score": item.score,
            "matched_columns": item.matched_columns,
            "required_columns": item.required_columns,
        }
        for item in matches[:limit]
    ]


def recommend_workstream_templates(
    profile: dict[str, Any],
    *,
    limit: int = 4,
) -> list[dict[str, Any]]:
    tables = profile.get("tables") or []
    columns = []
    if tables and isinstance(tables[0], dict):
        columns = tables[0].get("columns") or []

    date_cols: list[str] = []
    region_cols: list[str] = []
    amount_cols: list[str] = []
    nullable_amount_cols: list[str] = []

    for col in columns:
        if not isinstance(col, dict):
            continue
        canonical_name = str(col.get("canonical_name") or col.get("name") or "").strip().lower()
        if not canonical_name:
            continue
        col_type = str(col.get("type") or "string").lower()
        is_nullable = bool(col.get("nullable"))
        stats = col.get("stats") or {}
        if isinstance(stats, dict):
            is_nullable = is_nullable or float(stats.get("null_pct") or 0) > 0

        if any(
            token in canonical_name
            for token in ("date", "time", "invoice", "created", "updated")
        ):
            date_cols.append(canonical_name)
        elif col_type in {"date", "datetime"}:
            date_cols.append(canonical_name)

        if any(token in canonical_name for token in ("region", "state", "territory", "area")):
            region_cols.append(canonical_name)

        if any(
            token in canonical_name
            for token in ("revenue", "amount", "sales", "total", "price")
        ):
            amount_cols.append(canonical_name)
            if is_nullable:
                nullable_amount_cols.append(canonical_name)

    recs: list[WorkstreamRecommendation] = []

    if date_cols and region_cols and amount_cols:
        date_col = date_cols[0]
        region_col = region_cols[0]
        amount_col = amount_cols[0]
        steps: list[dict[str, Any]] = [
            {"type": "normalize_dates", "column": date_col},
            {"type": "map_values", "column": region_col, "map": "region_aliases"},
        ]
        if amount_col in nullable_amount_cols:
            steps.append({"type": "filter", "expr": f'"{amount_col}" IS NOT NULL'})
        recs.append(
            WorkstreamRecommendation(
                recommendation_id="rec_revenue_cleanup",
                name="Revenue Cleanup Template",
                summary=(
                    "Standardize dates and regions, and optionally remove "
                    "null-value revenue rows."
                ),
                confidence=0.92 if amount_col in nullable_amount_cols else 0.84,
                rationale=[
                    f"Detected date column `{date_col}`.",
                    f"Detected region-like column `{region_col}`.",
                    f"Detected financial column `{amount_col}`.",
                ],
                suggested_steps=steps,
                output_targets=["csv_download", "workstream_reuse", "sqlserver_export"],
                prompt_hint=(
                    "Use the recommended revenue cleanup template steps, preview impact, "
                    "validate warnings, request approval if needed, then run the recipe."
                ),
            )
        )

    if date_cols:
        date_col = date_cols[0]
        recs.append(
            WorkstreamRecommendation(
                recommendation_id=f"rec_date_{date_col}",
                name="Date Standardization Template",
                summary="Normalize date formats to a consistent date type.",
                confidence=0.78,
                rationale=[f"Found date-like column `{date_col}`."],
                suggested_steps=[{"type": "normalize_dates", "column": date_col}],
                output_targets=["csv_download", "workstream_reuse"],
                prompt_hint=(
                    f"Normalize dates in `{date_col}`, then preview and validate before running."
                ),
            )
        )

    if region_cols:
        region_col = region_cols[0]
        recs.append(
            WorkstreamRecommendation(
                recommendation_id=f"rec_region_{region_col}",
                name="Region Normalization Template",
                summary="Map region aliases into canonical values.",
                confidence=0.74,
                rationale=[f"Found region-like column `{region_col}`."],
                suggested_steps=[
                    {"type": "map_values", "column": region_col, "map": "region_aliases"}
                ],
                output_targets=["csv_download", "workstream_reuse", "sqlserver_export"],
                prompt_hint=f"Map region aliases in `{region_col}`, then preview and run.",
            )
        )

    if nullable_amount_cols:
        amount_col = nullable_amount_cols[0]
        recs.append(
            WorkstreamRecommendation(
                recommendation_id=f"rec_null_{amount_col}",
                name="Null-Safe Metric Template",
                summary="Filter rows where critical metric values are missing.",
                confidence=0.8,
                rationale=[f"Column `{amount_col}` appears nullable and metric-like."],
                suggested_steps=[{"type": "filter", "expr": f'"{amount_col}" IS NOT NULL'}],
                output_targets=["csv_download", "workstream_reuse", "sqlserver_export"],
                prompt_hint=f"Filter out null values in `{amount_col}`, then preview and run.",
            )
        )

    if not recs and columns:
        recs.append(
            WorkstreamRecommendation(
                recommendation_id="rec_starter",
                name="Starter Profiling Flow",
                summary="Run a profile-first guided plan and let the agent generate recipe steps.",
                confidence=0.5,
                rationale=["No strong template pattern detected. Use guided profiling first."],
                suggested_steps=[],
                output_targets=["csv_download", "workstream_reuse"],
                prompt_hint=(
                    "Analyze schema and profiles, propose the safest cleanup recipe, preview, "
                    "validate, and then run."
                ),
            )
        )

    # Deduplicate by recommendation id while preserving order.
    unique: list[WorkstreamRecommendation] = []
    seen: set[str] = set()
    for rec in recs:
        if rec.recommendation_id in seen:
            continue
        seen.add(rec.recommendation_id)
        unique.append(rec)

    unique.sort(key=lambda item: item.confidence, reverse=True)
    return [
        {
            "recommendation_id": rec.recommendation_id,
            "name": rec.name,
            "summary": rec.summary,
            "confidence": rec.confidence,
            "rationale": rec.rationale,
            "suggested_steps": rec.suggested_steps,
            "output_targets": rec.output_targets,
            "prompt_hint": rec.prompt_hint,
        }
        for rec in unique[:limit]
    ]
