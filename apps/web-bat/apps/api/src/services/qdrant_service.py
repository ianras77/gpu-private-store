import time
from typing import Any

from config import settings
from services.http_clients import get_shared_async_client
from services.structured_logging import get_logger, log_event

COLLECTION = "source_chunks"
logger = get_logger("bat.qdrant")
_COLLECTION_CACHE_TTL_SECONDS = 300.0
_collection_state: dict[str, tuple[int, float]] = {}


def _collection_is_cached(collection: str, *, vector_size: int) -> bool:
    cached = _collection_state.get(collection)
    if not cached:
        return False
    cached_size, cached_at = cached
    return cached_size == vector_size and (time.monotonic() - cached_at) < _COLLECTION_CACHE_TTL_SECONDS


def _remember_collection(collection: str, *, vector_size: int) -> None:
    _collection_state[collection] = (vector_size, time.monotonic())


def _invalidate_collection(collection: str) -> None:
    _collection_state.pop(collection, None)


def _extract_vector_size(data: dict[str, Any]) -> int | None:
    vectors_cfg = ((data.get("result") or {}).get("config") or {}).get("params", {}).get("vectors")
    if not isinstance(vectors_cfg, dict):
        return None

    if isinstance(vectors_cfg.get("size"), int):
        return vectors_cfg.get("size")

    # Named-vectors mode.
    for value in vectors_cfg.values():
        if isinstance(value, dict) and isinstance(value.get("size"), int):
            return value.get("size")

    return None


async def _get_existing_vector_size(client: Any, url: str) -> int | None:
    response = await client.get(url, timeout=8)
    if response.status_code == 404:
        return None

    response.raise_for_status()
    data = response.json() if response.content else {}
    return _extract_vector_size(data) if isinstance(data, dict) else None


def _collection_is_compatible(existing_size: int | None, vector_size: int) -> bool:
    return existing_size == vector_size


async def ensure_collection(vector_size: int) -> bool:
    if _collection_is_cached(COLLECTION, vector_size=vector_size):
        return True

    url = f"{settings.qdrant_url.rstrip('/')}/collections/{COLLECTION}"
    payload = {
        "vectors": {
            "size": vector_size,
            "distance": "Cosine",
        }
    }
    try:
        client = get_shared_async_client()
        existing_size = await _get_existing_vector_size(client, url)
        if _collection_is_compatible(existing_size, vector_size):
            _remember_collection(COLLECTION, vector_size=vector_size)
            log_event(
                logger,
                "qdrant.ensure_collection.exists_compatible",
                collection=COLLECTION,
                vector_size=vector_size,
            )
            return True

        if existing_size is not None:
            _invalidate_collection(COLLECTION)
            log_event(
                logger,
                "qdrant.ensure_collection.incompatible",
                level=40,
                collection=COLLECTION,
                expected_vector_size=vector_size,
                existing_vector_size=existing_size,
            )
            return False

        response = await client.put(url, json=payload, timeout=8)
        if response.status_code in {200, 201}:
            _remember_collection(COLLECTION, vector_size=vector_size)
            log_event(logger, "qdrant.ensure_collection.success", collection=COLLECTION, vector_size=vector_size)
            return True

        if response.status_code == 409:
            existing_size = await _get_existing_vector_size(client, url)
            if _collection_is_compatible(existing_size, vector_size):
                _remember_collection(COLLECTION, vector_size=vector_size)
                log_event(
                    logger,
                    "qdrant.ensure_collection.exists_compatible",
                    collection=COLLECTION,
                    vector_size=vector_size,
                )
                return True

            _invalidate_collection(COLLECTION)
            log_event(
                logger,
                "qdrant.ensure_collection.incompatible",
                level=40,
                collection=COLLECTION,
                expected_vector_size=vector_size,
                existing_vector_size=existing_size,
            )
            return False

        response.raise_for_status()
        _remember_collection(COLLECTION, vector_size=vector_size)
        log_event(logger, "qdrant.ensure_collection.success", collection=COLLECTION, vector_size=vector_size)
        return True
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "qdrant.ensure_collection.failed",
            level=40,
            collection=COLLECTION,
            vector_size=vector_size,
            error=str(exc),
        )
        return False


async def upsert_points(points: list[dict[str, Any]]) -> bool:
    if not points:
        return False

    url = f"{settings.qdrant_url.rstrip('/')}/collections/{COLLECTION}/points"
    try:
        client = get_shared_async_client()
        response = await client.put(url, json={"points": points}, timeout=8)
        response.raise_for_status()
        log_event(logger, "qdrant.upsert.success", collection=COLLECTION, point_count=len(points))
        return True
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "qdrant.upsert.failed",
            level=40,
            collection=COLLECTION,
            point_count=len(points),
            error=str(exc),
        )
        return False


async def delete_points(point_ids: list[str]) -> bool:
    if not point_ids:
        return True

    url = f"{settings.qdrant_url.rstrip('/')}/collections/{COLLECTION}/points/delete"
    try:
        client = get_shared_async_client()
        response = await client.post(url, json={"points": point_ids}, timeout=8)
        response.raise_for_status()
        log_event(logger, "qdrant.delete.success", collection=COLLECTION, point_count=len(point_ids))
        return True
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "qdrant.delete.failed",
            level=30,
            collection=COLLECTION,
            point_count=len(point_ids),
            error=str(exc),
        )
        return False


async def search_points(vector: list[float], limit: int, *, with_payload: bool = True) -> list[dict[str, Any]]:
    if not vector or limit <= 0:
        return []

    url = f"{settings.qdrant_url.rstrip('/')}/collections/{COLLECTION}/points/search"
    payload = {
        "vector": vector,
        "limit": max(1, limit),
        "with_payload": with_payload,
    }
    try:
        client = get_shared_async_client()
        response = await client.post(url, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        rows = data.get("result", []) if isinstance(data, dict) else []
        log_event(logger, "qdrant.search.success", collection=COLLECTION, limit=limit, returned=len(rows))
        return rows if isinstance(rows, list) else []
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "qdrant.search.failed",
            level=40,
            collection=COLLECTION,
            limit=limit,
            error=str(exc),
        )
        return []
