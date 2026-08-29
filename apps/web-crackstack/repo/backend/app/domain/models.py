"""Strict product contracts shared by deterministic execution and AI planning."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CrackStatus(StrEnum):
    queued = "queued"
    profiling = "profiling"
    planning = "planning"
    awaiting_approval = "awaiting_approval"
    executing = "executing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Risk(StrEnum):
    read_only = "read_only"
    low = "low"
    medium = "medium"
    high = "high"
    external = "external"


class ColumnProfile(StrictModel):
    name: str = Field(min_length=1)
    physical_type: str
    semantic_type: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    null_count: int = Field(default=0, ge=0)
    row_count: int = Field(default=0, ge=0)
    distinct_count: int | None = Field(default=None, ge=0)
    top_values: list[tuple[str, int]] = Field(default_factory=list)


class DatasetFingerprint(StrictModel):
    algorithm: Literal["sha256-structure"] = "sha256-structure"
    digest: str = Field(min_length=8)
    column_count: int = Field(ge=0)
    normalized_columns: tuple[str, ...]
    type_signature: tuple[str, ...]


class DatasetProfile(StrictModel):
    row_count: int = Field(ge=0)
    column_count: int = Field(ge=0)
    columns: tuple[ColumnProfile, ...]
    duplicate_rows: int = Field(default=0, ge=0)
    empty_rows: int = Field(default=0, ge=0)
    quality_score: float | None = Field(default=None, ge=0, le=100)


class DataIntent(StrictModel):
    objective: str = Field(min_length=1, max_length=4000)
    family: Literal[
        "clean", "normalize", "map", "reshape", "join", "aggregate", "compare",
        "analyze", "validate", "export", "reconcile", "repeat_previous_flow",
        "investigate", "summarize",
    ]
    confidence: float = Field(ge=0, le=1)
    assumptions: tuple[str, ...] = ()


class TransformSpec(StrictModel):
    operation: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    arguments: dict[str, Any] = Field(default_factory=dict)
    risk: Risk

    @field_validator("operation")
    @classmethod
    def reject_arbitrary_code(cls, value: str) -> str:
        if value in {"python", "run_python", "sql", "run_sql", "shell", "exec"}:
            raise ValueError("arbitrary code operations are not allowed")
        return value


class CrackStep(StrictModel):
    step_id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    transform: TransformSpec
    reason: str = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    expected_effect: str = Field(min_length=1)


class CrackPlan(StrictModel):
    steps: tuple[CrackStep, ...]
    source_version_id: str = Field(min_length=1)


class TransformPreview(StrictModel):
    before_rows: int = Field(ge=0)
    after_rows: int = Field(ge=0)
    row_delta: int
    columns_added: tuple[str, ...] = ()
    columns_removed: tuple[str, ...] = ()
    type_changes: tuple[str, ...] = ()
    sample_changes: tuple[dict[str, Any], ...] = ()


class QualityRule(StrictModel):
    rule_id: str = Field(min_length=1)
    kind: Literal[
        "not_null", "unique", "range", "allowed_values", "date_between", "row_count_change"
    ]
    arguments: dict[str, Any] = Field(default_factory=dict)
    severity: Literal["warning", "error"] = "error"


class QualityPlan(StrictModel):
    rules: tuple[QualityRule, ...] = ()


class FlowDefinition(StrictModel):
    flow_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    input_fingerprint: DatasetFingerprint
    plan: CrackPlan
    quality_plan: QualityPlan
    output_schema: tuple[str, ...]


class ApprovalRequest(StrictModel):
    approval_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    risk: Risk
    evidence: tuple[str, ...] = ()
    decision: Literal["pending", "approved", "rejected"] = "pending"
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class ArtifactRef(StrictModel):
    artifact_id: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    artifact_type: str = Field(min_length=1)
    storage_key: str = Field(min_length=1)
    sha256: str = Field(min_length=8)
    size_bytes: int = Field(ge=0)


class LineageRecord(StrictModel):
    input_version_id: str = Field(min_length=1)
    output_version_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    step_ids: tuple[str, ...]


class CrackState(StrictModel):
    tenant_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    dataset_id: str = Field(min_length=1)
    dataset_version_id: str = Field(min_length=1)
    objective: str = Field(min_length=1)
    fingerprint: DatasetFingerprint | None = None
    profile: DatasetProfile | None = None
    intent: DataIntent | None = None
    plan: CrackPlan | None = None
    preview: TransformPreview | None = None
    quality_plan: QualityPlan | None = None
    approval: ApprovalRequest | None = None
    output_version_id: str | None = None
    artifacts: tuple[ArtifactRef, ...] = ()
    status: CrackStatus = CrackStatus.queued
