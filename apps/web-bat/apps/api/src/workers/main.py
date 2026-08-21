import asyncio
from contextlib import suppress
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis

from config import settings
from db import SessionLocal
from services.structured_logging import get_logger, log_event
from workers.jobs import PIPELINE_LOCK_KEY, _log_pipeline_event, run_pipeline_cycle, run_research_phase, run_editorial_phase

logger = get_logger("bat-worker")


def _cycle_interval_seconds() -> int:
    return max(int(settings.worker_min_cycle_seconds), int(settings.worker_cycle_minutes) * 60)


def _heartbeat_ttl_seconds(cycle_interval_seconds: int) -> int:
    return max(
        int(settings.worker_heartbeat_ttl_seconds),
        int(settings.worker_max_cycle_seconds) + 300,
        cycle_interval_seconds + 300,
    )


def _progress_heartbeat_interval_seconds(cycle_interval_seconds: int) -> int:
    return max(30, min(300, int(cycle_interval_seconds) // 3))


def _research_due_now(now: datetime) -> bool:
    slots = {item.strip() for item in str(settings.research_schedule_utc).split(",") if item.strip()}
    return now.strftime("%H:%M") in slots


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


async def _cycle_progress_heartbeat(
    *,
    cycle_interval_seconds: int,
    cycle_started_at: str,
    interval_seconds: int | None = None,
) -> None:
    interval = max(1, int(interval_seconds or _progress_heartbeat_interval_seconds(cycle_interval_seconds)))
    while True:
        await asyncio.sleep(interval)
        await _write_worker_heartbeat(
            status="running",
            event="cycle_progress",
            cycle_interval_seconds=cycle_interval_seconds,
            details={"cycle_started_at": cycle_started_at},
        )


def _parse_pipeline_lock_token(token: str | None) -> tuple[uuid.UUID, str] | None:
    if not token or ":" not in token:
        return None
    raw_cycle_id, actor = token.split(":", 1)
    try:
        cycle_id = uuid.UUID(raw_cycle_id)
    except ValueError:
        return None
    return cycle_id, actor


async def _recover_orphaned_pipeline_lock(db: Any) -> dict[str, Any]:
    client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        token = await client.get(PIPELINE_LOCK_KEY)
        parsed = _parse_pipeline_lock_token(token)
        if parsed is None:
            return {"recovered": False, "reason": "lock_missing_or_unparseable"}

        cycle_id, actor = parsed
        if actor != "worker":
            return {"recovered": False, "reason": "lock_not_owned_by_worker", "actor": actor}

        current = await client.get(PIPELINE_LOCK_KEY)
        if current != token:
            return {"recovered": False, "reason": "lock_changed"}

        await _log_pipeline_event(
            db,
            cycle_id=cycle_id,
            action="cycle_failed",
            actor="worker",
            snapshot={
                "error": "Worker restarted before releasing pipeline lock.",
                "failed_at": datetime.now(timezone.utc),
                "reason": "worker_restarted",
                "recovered_lock_token": token,
            },
        )
        await client.delete(PIPELINE_LOCK_KEY)
        log_event(
            logger,
            "worker.recovered_orphaned_pipeline_lock",
            cycle_id=str(cycle_id),
            actor=actor,
        )
        return {"recovered": True, "cycle_id": str(cycle_id), "actor": actor}
    except Exception as exc:  # noqa: BLE001
        log_event(logger, "worker.pipeline_lock_recovery_failed", level=40, error=str(exc))
        return {"recovered": False, "reason": "recovery_failed", "error": str(exc)}
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
    async with SessionLocal() as db:
        await _recover_orphaned_pipeline_lock(db)

    while True:
        try:
            cycle_started_at = datetime.now(timezone.utc).isoformat()
            await _write_worker_heartbeat(
                status="running",
                event="cycle_started",
                cycle_interval_seconds=cycle_interval_seconds,
                details={"cycle_started_at": cycle_started_at},
            )
            progress_heartbeat = asyncio.create_task(
                _cycle_progress_heartbeat(
                    cycle_interval_seconds=cycle_interval_seconds,
                    cycle_started_at=cycle_started_at,
                )
            )
            try:
                async with SessionLocal() as db:
                    now = datetime.now(timezone.utc)
                    if str(settings.worker_phase).strip().lower() == "split":
                        if _research_due_now(now):
                            research_summary = await asyncio.wait_for(run_research_phase(db), timeout=max_cycle_seconds)
                            editorial_runs = []
                            for _ in range(max(1, min(8, int(settings.editorial_loops_per_research)))):
                                editorial_runs.append(
                                    await asyncio.wait_for(run_editorial_phase(db), timeout=max_cycle_seconds)
                                )
                            cycle_summary = {
                                "phase": "research_then_editorial_burst",
                                "research": research_summary,
                                "editorial_loop_count": len(editorial_runs),
                                "editorial_runs": editorial_runs,
                            }
                        else:
                            cycle_summary = await asyncio.wait_for(run_editorial_phase(db), timeout=max_cycle_seconds)
                    else:
                        cycle_summary = await asyncio.wait_for(run_pipeline_cycle(db), timeout=max_cycle_seconds)
            finally:
                progress_heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await progress_heartbeat
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
