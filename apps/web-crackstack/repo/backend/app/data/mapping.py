from __future__ import annotations

import difflib
from typing import Any


def _best_match(
    source_names: list[str],
    target_name: str,
) -> tuple[list[str], float, list[str]]:
    """Find best matching source name(s) for a target using difflib ratio."""
    if not source_names:
        return [], 0.0, []
    scores = [
        (name, difflib.SequenceMatcher(None, name, target_name).ratio())
        for name in source_names
    ]
    scores.sort(key=lambda x: x[1], reverse=True)
    top_name, top_score = scores[0]
    return [top_name], float(top_score), [f"name_ratio={top_score:.2f}"]


def plan_mapping(
    dataset_profile: dict[str, Any],
    template_schema: dict[str, Any],
) -> dict[str, Any]:
    """Produce deterministic mapping suggestions between dataset profile and template schema."""
    source_columns = {
        col["canonical_name"]: col
        for table in dataset_profile.get("tables", [])
        for col in table.get("columns", [])
    }
    source_names = list(source_columns.keys())

    target_table = template_schema.get("tables", [{}])[0]
    mapping_entries = []
    unmapped_source = set(source_names)
    unfilled_target = []
    warnings = []

    for target_col in target_table.get("columns", []):
        t_name = target_col["canonical_name"]
        sources, score, evidence = _best_match(source_names, t_name)
        if score >= 0.7:
            mapping_entries.append(
                {
                    "target": t_name,
                    "source": sources,
                    "transform": [],
                    "confidence": round(score, 2),
                    "evidence": evidence,
                }
            )
            for s in sources:
                unmapped_source.discard(s)
        else:
            unfilled_target.append(t_name)

    if unfilled_target:
        warnings.append(f"Unfilled target columns: {', '.join(unfilled_target)}")
    if unmapped_source:
        warnings.append(f"Unmapped source columns: {', '.join(sorted(unmapped_source))}")

    return {
        "target_columns": mapping_entries,
        "unmapped_source_columns": sorted(unmapped_source),
        "unfilled_target_columns": unfilled_target,
        "warnings": warnings,
    }
