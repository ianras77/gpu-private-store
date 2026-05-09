#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
from collections import Counter

from sqlalchemy import select

from db import SessionLocal
from models import Source
from services.cat_memory_service import sync_source_memory


def _build_query_text(source: Source, fallback_query: str) -> str:
    metadata = source.meta or {}
    return (
        str(metadata.get("query") or "").strip()
        or str(metadata.get("search_query") or "").strip()
        or str(source.title or "").strip()
        or fallback_query
    )


async def _run(limit: int, fallback_query: str) -> dict[str, object]:
    counters: Counter[str] = Counter()
    synced_sources: list[str] = []

    async with SessionLocal() as session:
        result = await session.execute(
            select(Source)
            .where(Source.source_type == "news")
            .order_by(Source.fetched_at.desc())
            .limit(limit)
        )
        sources = list(result.scalars())
        counters["considered"] = len(sources)

        for source in sources:
            metadata = source.meta or {}
            query_text = _build_query_text(source, fallback_query)
            allow_sync = bool(metadata.get("vector_indexed")) and not bool(metadata.get("embedding_needs_refresh"))
            sync_result = await sync_source_memory(source, query_text=query_text, allow_sync=allow_sync)
            status = str(sync_result.get("status") or "unknown")
            counters[status] += 1
            if status in {"synced", "current"}:
                synced_sources.append(str(source.id))

        await session.commit()

    return {
        "limit": limit,
        "fallback_query": fallback_query,
        "counts": dict(sorted(counters.items())),
        "synced_source_ids": synced_sources[:20],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill Cheshire Cat declarative memory from recent BAT sources.")
    parser.add_argument("--limit", type=int, default=24, help="Number of recent news sources to inspect.")
    parser.add_argument(
        "--fallback-query",
        default="Trump administration latest 2026",
        help="Fallback query used when a source has no stored query metadata.",
    )
    args = parser.parse_args()

    summary = asyncio.run(_run(max(1, args.limit), args.fallback_query.strip() or "Trump administration latest 2026"))
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
