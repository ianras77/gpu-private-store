import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis

from config import settings
from db import SessionLocal
from services.structured_logging import get_logger, log_event
from workers.jobs import run_pipeline_cycle

logger = get_logger("bat-worker")


def _cycle_interval_seconds() -> int:
    return max(int(settings.worker_min_cycle_seconds), int(settings.worker_cycle_minutes) * 60)


def _heartbeat_ttl_seconds(cycle_interval_seconds: int) -> int:
    return max(
        int(settings.worker_heartbeat_ttl_seconds),
        int(settings.worker_max_cycle_seconds) + 300,
        cycle_interval_seconds + 300,
    )


def _heartbeat_payload(
    *,
    status: str,
    event: str,
    cycle_interval_seconds: int,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": status,
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
        "cycle_interval_seconds": cycle_interval_seconds,
        "max_cycle_seconds": int(settings.worker_max_cycle_seconds),
    }
    if details:
        payload.update(details)
    return payload


async def _write_worker_heartbeat(
    *,
    status: str,
    event: str,
    cycle_interval_seconds: int,
    details: dict[str, Any] | None = None,
) -> None:
    payload = _heartbeat_payload(
        status=status,
        event=event,
        cycle_interval_seconds=cycle_interval_seconds,
        details=details,
    )
    client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        await client.set(
            settings.worker_heartbeat_key,
            json.dumps(payload, default=str, sort_keys=True),
            ex=_heartbeat_ttl_seconds(cycle_interval_seconds),
        )
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "worker.heartbeat_failed", level=40, error=str(exc))
    finally:
        await client.aclose()


async def worker_loop() -> None:
    log_event(logger, "worker.started", manual_review=settings.enable_manual_review)
    cycle_interval_seconds = _cycle_interval_seconds()
    max_cycle_seconds = max(60, int(settings.worker_max_cycle_seconds))
    log_event(
        logger,
        "worker.cadence_set",
        cycle_minutes=int(settings.worker_cycle_minutes),
        cycle_seconds=cycle_interval_seconds,
        max_cycle_seconds=max_cycle_seconds,
        heartbeat_ttl_seconds=_heartbeat_ttl_seconds(cycle_interval_seconds),
    )
    await _write_worker_heartbeat(
        status="starting",
        event="worker_started",
        cycle_interval_seconds=cycle_interval_seconds,
    )

    while True:
        try:
            await _write_worker_heartbeat(
                status="running",
                event="cycle_started",
                cycle_interval_seconds=cycle_interval_seconds,
            )
            async with SessionLocal() as db:
                cycle_summary = await asyncio.wait_for(run_pipeline_cycle(db), timeout=max_cycle_seconds)
                log_event(logger, "worker.cycle_complete", summary=cycle_summary)
                await _write_worker_heartbeat(
                    status="sleeping",
                    event="cycle_complete",
                    cycle_interval_seconds=cycle_interval_seconds,
                    details={
                        "cycle_id": cycle_summary.get("cycle_id"),
                        "duration_seconds": cycle_summary.get("duration_seconds"),
                    },
                )
        except asyncio.TimeoutError:
            message = f"pipeline cycle exceeded {max_cycle_seconds} seconds"
            log_event(logger, "worker.cycle_timeout", level=40, error=message)
            await _write_worker_heartbeat(
                status="timeout",
                event="cycle_timeout",
                cycle_interval_seconds=cycle_interval_seconds,
                details={"error": message},
            )
            raise
        except Exception as exc:  # noqa: BLE001
            log_event(logger, "worker.cycle_failed", level=40, error=str(exc))
            await _write_worker_heartbeat(
                status="sleeping",
                event="cycle_failed",
                cycle_interval_seconds=cycle_interval_seconds,
                details={"error": str(exc)},
            )

        await asyncio.sleep(cycle_interval_seconds)


if __name__ == "__main__":
    asyncio.run(worker_loop())
