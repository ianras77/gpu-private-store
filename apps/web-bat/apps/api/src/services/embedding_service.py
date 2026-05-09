import hashlib
import math
import time
import uuid
from typing import Any, Sequence

import httpx

from config import settings
from services.http_clients import get_shared_async_client
from services.qdrant_service import ensure_collection, upsert_points
from services.structured_logging import get_logger, log_event

logger = get_logger("bat.embedding")


def _fallback_vector_for_text(text: str) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8", errors="ignore")).digest()
    return [float((b / 255.0) * 2 - 1) for b in digest[:32]]


def _embedding_endpoint_supports_multi_input(url: str) -> bool:
    normalized = url.rstrip("/")
    return normalized.endswith("/api/embed") or normalized.endswith("/v1/embeddings")


def _build_embedding_payload(texts: Sequence[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {"model": settings.embedding_model}
    base_url = settings.embedding_api_url.rstrip("/")
    key = "input" if base_url.endswith("/api/embed") or base_url.endswith("/v1/embeddings") else "prompt"
    payload[key] = texts[0] if len(texts) == 1 else list(texts)
    return payload


def _extract_embedding_vectors(payload: Any, *, expected_count: int) -> list[list[float]]:
    if not isinstance(payload, dict):
        return []

    embeddings = payload.get("embeddings")
    if isinstance(embeddings, list) and embeddings and isinstance(embeddings[0], list):
        return [[float(value) for value in vector] for vector in embeddings[:expected_count] if isinstance(vector, list) and vector]

    data_rows = payload.get("data")
    if isinstance(data_rows, list):
        vectors: list[list[float]] = []
        for row in data_rows[:expected_count]:
            vector = row.get("embedding") if isinstance(row, dict) else None
            if not isinstance(vector, list) or not vector:
                return []
            vectors.append([float(value) for value in vector])
        return vectors

    embedding = payload.get("embedding")
    if isinstance(embedding, list) and embedding:
        if isinstance(embedding[0], list):
            return [[float(value) for value in vector] for vector in embedding[:expected_count] if isinstance(vector, list) and vector]
        if expected_count == 1:
            return [[float(value) for value in embedding]]

    return []


def _is_retryable_embedding_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {429, 502, 503, 504}
    return isinstance(
        exc,
        (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadTimeout,
            httpx.RemoteProtocolError,
            httpx.WriteError,
        ),
    )


async def _embed_batch(texts: Sequence[str]) -> list[list[float] | None]:
    if not texts:
        return []

    if len(texts) > 1 and not _embedding_endpoint_supports_multi_input(settings.embedding_api_url):
        log_event(
            logger,
            "embedding.batch.singleflight_fallback",
            level=30,
            model=settings.embedding_model,
            input_count=len(texts),
            endpoint=settings.embedding_api_url,
        )
        resolved: list[list[float] | None] = []
        for text in texts:
            single_vector = await _embed_batch([text])
            resolved.extend(single_vector)
        return resolved

    payload = _build_embedding_payload(texts)
    retries = max(0, int(settings.embedding_request_retries))
    try:
        for attempt in range(retries + 1):
            try:
                started = time.perf_counter()
                client = get_shared_async_client()
                response = await client.post(
                    settings.embedding_api_url,
                    json=payload,
                    timeout=max(6.0, float(settings.embedding_request_timeout_seconds)),
                )
                response.raise_for_status()
                data = response.json()
                vectors = _extract_embedding_vectors(data, expected_count=len(texts))
                if len(vectors) != len(texts):
                    raise ValueError(
                        f"Expected {len(texts)} embeddings but received {len(vectors)} from {settings.embedding_api_url}."
                    )
                if vectors and vectors[0]:
                    log_event(
                        logger,
                        "embedding.batch.generated",
                        model=settings.embedding_model,
                        input_count=len(texts),
                        vector_size=len(vectors[0]),
                        latency_ms=int((time.perf_counter() - started) * 1000),
                    )
                return vectors
            except Exception as exc:  # noqa: BLE001
                if attempt < retries and _is_retryable_embedding_error(exc):
                    log_event(
                        logger,
                        "embedding.batch.retrying",
                        level=30,
                        model=settings.embedding_model,
                        input_count=len(texts),
                        attempt=attempt + 1,
                        error=str(exc),
                    )
                    continue
                raise
    except Exception as exc:  # noqa: BLE001
        log_event(
            logger,
            "embedding.request_failed",
            level=40,
            model=settings.embedding_model,
            input_count=len(texts),
            error=str(exc),
        )
        if not settings.embedding_allow_fallback:
            return [None for _ in texts]

    fallback_vectors = [_fallback_vector_for_text(text) for text in texts]
    log_event(
        logger,
        "embedding.fallback_used",
        level=30,
        input_count=len(texts),
        vector_size=len(fallback_vectors[0]) if fallback_vectors else 0,
    )
    return fallback_vectors


async def embed_texts(texts: Sequence[str]) -> list[list[float] | None]:
    if not texts:
        return []

    batches = max(1, int(settings.embedding_batch_size))
    unique_texts: list[str] = []
    positions_by_text: dict[str, list[int]] = {}
    for index, text in enumerate(texts):
        normalized = str(text or "")
        if normalized not in positions_by_text:
            unique_texts.append(normalized)
            positions_by_text[normalized] = []
        positions_by_text[normalized].append(index)

    resolved: list[list[float] | None] = [None for _ in texts]
    total_batches = int(math.ceil(len(unique_texts) / batches))

    for batch_index in range(total_batches):
        start = batch_index * batches
        batch_texts = unique_texts[start : start + batches]
        vectors = await _embed_batch(batch_texts)
        for text, vector in zip(batch_texts, vectors, strict=True):
            for position in positions_by_text[text]:
                resolved[position] = [float(value) for value in vector] if vector else None

    if len(unique_texts) != len(texts):
        log_event(
            logger,
            "embedding.batch.deduped",
            model=settings.embedding_model,
            requested_inputs=len(texts),
            unique_inputs=len(unique_texts),
        )

    return resolved


async def embed_text(text: str) -> list[float] | None:
    vectors = await embed_texts([text])
    return vectors[0] if vectors else None


async def prepare_chunk_points(chunks: list[dict[str, Any]]) -> tuple[list[str | None], list[dict[str, Any]]]:
    if not chunks:
        return [], []

    vectors = await embed_texts([str(chunk.get("chunk_text") or "") for chunk in chunks])
    point_ids: list[str | None] = [None for _ in chunks]
    points: list[dict[str, Any]] = []

    for idx, (item, vector) in enumerate(zip(chunks, vectors, strict=True)):
        if not vector:
            continue
        point_id = str(uuid.uuid4())
        point_ids[idx] = point_id
        points.append(
            {
                "id": point_id,
                "vector": vector,
                "payload": {
                    "source_id": str(item["source_id"]),
                    "chunk_index": item["chunk_index"],
                    "chunk_text": item["chunk_text"][:4000],
                    **(item.get("metadata") or {}),
                },
            }
        )

    return point_ids, points


async def index_prepared_points(points: list[dict[str, Any]]) -> bool:
    if not points:
        log_event(logger, "embedding.no_vectors_created", level=30, chunk_count=0)
        return False

    collection_ready = await ensure_collection(len(points[0]["vector"]))
    if not collection_ready:
        return False

    return await upsert_points(points)


async def upsert_chunk_vectors(chunks: list[dict[str, Any]]) -> list[str | None]:
    if not chunks:
        return []

    point_ids, points = await prepare_chunk_points(chunks)
    if not points:
        log_event(logger, "embedding.no_vectors_created", level=30, chunk_count=len(chunks))
        return point_ids

    upserted = await index_prepared_points(points)
    if not upserted:
        return point_ids

    return point_ids
