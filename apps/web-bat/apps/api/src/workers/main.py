import asyncio

from config import settings
from db import SessionLocal
from services.structured_logging import get_logger, log_event
from workers.jobs import run_pipeline_cycle

logger = get_logger("bat-worker")


async def worker_loop() -> None:
    log_event(logger, "worker.started", manual_review=settings.enable_manual_review)
    cycle_interval_seconds = max(int(settings.worker_min_cycle_seconds), int(settings.worker_cycle_minutes) * 60)
    log_event(
        logger,
        "worker.cadence_set",
        cycle_minutes=int(settings.worker_cycle_minutes),
        cycle_seconds=cycle_interval_seconds,
    )

    while True:
        try:
            async with SessionLocal() as db:
                cycle_summary = await run_pipeline_cycle(db)
                log_event(logger, "worker.cycle_complete", summary=cycle_summary)
        except Exception as exc:  # noqa: BLE001
            log_event(logger, "worker.cycle_failed", level=40, error=str(exc))

        await asyncio.sleep(cycle_interval_seconds)


if __name__ == "__main__":
    asyncio.run(worker_loop())
