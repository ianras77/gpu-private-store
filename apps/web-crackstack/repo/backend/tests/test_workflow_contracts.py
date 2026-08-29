from app.workflows.temporal.contracts import RetryClass, activity_idempotency_key, classify_failure
from app.workflows.temporal.data_crack import initial_state


def test_retry_policy_distinguishes_failures() -> None:
    assert classify_failure(TimeoutError("provider timeout")) == RetryClass.transient
    assert classify_failure(ValueError("invalid plan")) == RetryClass.permanent
    assert classify_failure(RuntimeError("approval rejected")) == RetryClass.approval


def test_idempotency_key_is_stable_and_activity_scoped() -> None:
    first = activity_idempotency_key("run-1", "execute", "v1")
    assert first == activity_idempotency_key("run-1", "execute", "v1")
    assert first != activity_idempotency_key("run-1", "export", "v1")


def test_initial_workflow_state_is_typed() -> None:
    state = initial_state("tenant-a", "user-a", "dataset-a", "v1", "clean this")
    assert state.tenant_id == "tenant-a"
    assert state.status.value == "queued"
