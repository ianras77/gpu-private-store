from __future__ import annotations

from app.domain.models import CrackState

WORKFLOW_NAME = "DataCrackWorkflow"
TASK_QUEUE = "crackstack-data"


def initial_state(
    tenant_id: str, user_id: str, dataset_id: str, dataset_version_id: str, objective: str
) -> CrackState:
    return CrackState(
        tenant_id=tenant_id,
        user_id=user_id,
        dataset_id=dataset_id,
        dataset_version_id=dataset_version_id,
        objective=objective,
    )


try:
    from temporalio import workflow
except ImportError:  # pragma: no cover
    workflow = None


if workflow is not None:

    @workflow.defn(name=WORKFLOW_NAME)
    class DataCrackWorkflow:
        @workflow.run
        async def run(self, state: CrackState) -> CrackState:
            return state
