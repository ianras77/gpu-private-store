from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis

from config import settings


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def evaluate_worker_heartbeat(
    payload: dict[str, Any] | None,
    *,
    now: datetime | None = None,
    stale_after_seconds: int,
) -> dict[str, Any]:
    if not payload:
        return {"ok": False, "reason": "heartbeat_missing"}

    status = str(payload.get("status") or "unknown").strip().lower()
    event = str(payload.get("event") or "").strip()
    timestamp = _parse_timestamp(payload.get("timestamp"))
    if timestamp is None:
        return {"ok": False, "reason": "heartbeat_invalid", "status": status, "event": event}

    current = now or _utc_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    age_seconds = max(0, int((current - timestamp).total_seconds()))

    result = {
        "ok": True,
        "status": status,
        "event": event,
        "age_seconds": age_seconds,
        "stale_after_seconds": int(stale_after_seconds),
        "cycle_interval_seconds": payload.get("cycle_interval_seconds"),
        "cycle_id": payload.get("cycle_id"),
    }

    if status == "timeout":
        result["ok"] = False
        result["reason"] = "worker_timeout"
    elif age_seconds > int(stale_after_seconds):
        result["ok"] = False
        result["reason"] = "heartbeat_stale"

    return result


async def read_worker_heartbeat() -> dict[str, Any]:
    client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        raw = await client.get(settings.worker_heartbeat_key)
    finally:
        await client.aclose()

    if not raw:
        return evaluate_worker_heartbeat(None, stale_after_seconds=int(settings.worker_heartbeat_ttl_seconds))

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"ok": False, "reason": "heartbeat_malformed"}
    if not isinstance(payload, dict):
        return {"ok": False, "reason": "heartbeat_malformed"}
    return evaluate_worker_heartbeat(payload, stale_after_seconds=int(settings.worker_heartbeat_ttl_seconds))


async def _main_async() -> int:
    try:
        result = await read_worker_heartbeat()
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "reason": "healthcheck_error", "error": str(exc)}
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get("ok") else 1


def main() -> None:
    raise SystemExit(asyncio.run(_main_async()))


if __name__ == "__main__":
    main()
