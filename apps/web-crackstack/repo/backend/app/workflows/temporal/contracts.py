"""Temporal-independent workflow contracts and idempotency helpers."""

from __future__ import annotations

from enum import StrEnum
from hashlib import sha256


class RetryClass(StrEnum):
    transient = "transient"
    permanent = "permanent"
    approval = "approval"
    cancelled = "cancelled"


def classify_failure(error: BaseException) -> RetryClass:
    if isinstance(error, (TimeoutError, ConnectionError, OSError)):
        return RetryClass.transient
    message = str(error).lower()
    if "approval" in message or "rejected" in message:
        return RetryClass.approval
    if "cancel" in message:
        return RetryClass.cancelled
    return RetryClass.permanent


def activity_idempotency_key(run_id: str, activity_name: str, version_id: str = "") -> str:
    material = f"{run_id}:{activity_name}:{version_id}".encode()
    return sha256(material).hexdigest()
