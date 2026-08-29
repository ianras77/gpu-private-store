import pytest
from pydantic import ValidationError

from app.domain.models import CrackPlan, TransformSpec


def test_transform_rejects_arbitrary_execution_operations() -> None:
    with pytest.raises(ValidationError, match="arbitrary code"):
        TransformSpec(operation="run_sql", risk="high")


def test_plan_rejects_unknown_fields_and_invalid_confidence() -> None:
    with pytest.raises(ValidationError):
        CrackPlan(
            source_version_id="v1",
            steps=[
                {
                    "step_id": "s1",
                    "description": "Normalize",
                    "transform": {"operation": "trim", "risk": "low"},
                    "reason": "Cleanup",
                    "confidence": 2,
                    "expected_effect": "Cleaner values",
                    "untrusted_sql": "DROP TABLE data",
                }
            ],
        )
