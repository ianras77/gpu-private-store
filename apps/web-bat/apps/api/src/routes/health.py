from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import httpx
import redis.asyncio as redis
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import EditorialObject, HomepageSnapshot, RevisionHistory, SocialPost, Source, SourceEmbedding, Theme
from services.cat_client import _extract_chat_completion_text, _extract_text_from_payload
from services.http_clients import get_shared_async_client
from services.qdrant_service import COLLECTION as QDRANT_COLLECTION
from services.qdrant_service import _extract_vector_size

router = APIRouter(prefix="/health", tags=["health"])
LLM_READINESS_PROBE_MAX_TOKENS = 256


def _serialize_revision(row: RevisionHistory) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "object_id": str(row.object_id),
        "action": row.action,
        "actor": row.actor,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "snapshot": row.snapshot,
    }


async def _check_db(db: AsyncSession) -> dict[str, Any]:
    started = datetime.utcnow()
    try:
        await db.execute(text("select 1"))
        return {"ok": True, "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def _check_redis() -> dict[str, Any]:
    started = datetime.utcnow()
    client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    try:
        pong = await client.ping()
        queue_keys = await client.keys("queue:*")
        queue_depth = 0
        for key in queue_keys:
            key_type = await client.type(key)
            if key_type == "list":
                queue_depth += int(await client.llen(key))
        return {
            "ok": bool(pong),
            "queue_depth": queue_depth,
            "queue_keys": queue_keys[:20],
            "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "queue_depth": None}
    finally:
        await client.aclose()


async def _http_check(
    url: str,
    *,
    method: str = "GET",
    json_payload: dict[str, Any] | None = None,
    timeout_seconds: float = 8,
) -> dict[str, Any]:
    started = datetime.utcnow()
    try:
        client = get_shared_async_client()
        response = await client.request(method, url, json=json_payload, timeout=timeout_seconds)
        response.raise_for_status()
        return {
            "ok": True,
            "status_code": response.status_code,
            "method": method.upper(),
            "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
        }
    except Exception as exc:  # noqa: BLE001
        detail = str(exc).strip() or exc.__class__.__name__
        return {"ok": False, "method": method.upper(), "error": detail}


def _ollama_tags_url(endpoint_url: str) -> str | None:
    normalized = endpoint_url.rstrip("/")
    suffixes = (
        "/api/chat",
        "/v1/chat/completions",
        "/api/embeddings",
        "/api/embed",
    )
    for suffix in suffixes:
        if normalized.endswith(suffix):
            return f"{normalized.removesuffix(suffix)}/api/tags"
    return None


def _normalize_model_name(model: str) -> str:
    return str(model or "").strip().lower().removesuffix(":latest")


def _build_llm_probe_payload(endpoint_url: str, model: str) -> dict[str, Any]:
    if endpoint_url.rstrip("/").endswith("/api/chat"):
        return {
            "model": model,
            "messages": [{"role": "user", "content": "Reply with exactly READY"}],
            "options": {"temperature": 0.0, "num_predict": LLM_READINESS_PROBE_MAX_TOKENS},
            "stream": False,
        }

    return {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly READY"}],
        "temperature": 0.0,
        "max_tokens": LLM_READINESS_PROBE_MAX_TOKENS,
        "reasoning_effort": "none",
        "stream": False,
    }


def _build_llm_probe_headers() -> dict[str, str]:
    api_key = str(settings.llm_api_key or "").strip()
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


def _build_embedding_probe_payload(endpoint_url: str, model: str) -> dict[str, Any]:
    if endpoint_url.rstrip("/").endswith("/api/embed"):
        return {"model": model, "input": "healthcheck"}
    return {"model": model, "prompt": "healthcheck"}


def _build_cat_message_probe_payload(text: str, *, user_id: str) -> dict[str, Any]:
    return {
        "text": text,
        "user_id": user_id,
    }


def _build_cat_memory_probe_payload(*, query_text: str, user_id: str) -> dict[str, Any]:
    return {
        "text": query_text,
        "k": 1,
        "metadata": {"kind": "source_dossier"},
        "user_id": user_id,
    }


def _extract_embedding_vector(payload: Any) -> list[float] | None:
    if isinstance(payload, dict):
        embeddings = payload.get("embeddings")
        if isinstance(embeddings, list) and embeddings:
            first = embeddings[0]
            if isinstance(first, list) and first:
                return [float(item) for item in first]

        vector = payload.get("embedding")
        if isinstance(vector, list) and vector:
            return [float(item) for item in vector]

        data = payload.get("data")
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                vector = first.get("embedding")
                if isinstance(vector, list) and vector:
                    return [float(item) for item in vector]
    return None


def _is_retryable_inference_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        response = exc.response
        return bool(response is not None and response.status_code in {429, 502, 503, 504})
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


async def _ollama_model_check(endpoint_url: str, model: str) -> dict[str, Any]:
    tags_url = _ollama_tags_url(endpoint_url)
    if not tags_url:
        return {"ok": False, "method": "GET", "probe": "ollama_tags", "error": "Unsupported Ollama endpoint URL."}

    started = datetime.utcnow()
    try:
        client = get_shared_async_client()
        response = await client.get(tags_url, timeout=8)
        response.raise_for_status()
        payload = response.json()
        models = []
        for item in payload.get("models", []) if isinstance(payload, dict) else []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("model") or "").strip()
            if name:
                models.append(name)
        normalized_target = _normalize_model_name(model)
        model_found = any(_normalize_model_name(name) == normalized_target for name in models)
        if not model_found:
            return {
                "ok": False,
                "method": "GET",
                "status_code": response.status_code,
                "probe": "ollama_tags",
                "error": f"Configured model '{model}' not found.",
                "available_models": models[:20],
            }
        return {
            "ok": True,
            "method": "GET",
            "status_code": response.status_code,
            "probe": "ollama_tags",
            "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
            "model": model,
        }
    except Exception as exc:  # noqa: BLE001
        detail = str(exc).strip() or exc.__class__.__name__
        return {"ok": False, "method": "GET", "probe": "ollama_tags", "error": detail}


async def _ollama_chat_check(endpoint_url: str, model: str) -> dict[str, Any]:
    for attempt in range(2):
        started = datetime.utcnow()
        try:
            client = get_shared_async_client()
            response = await client.post(
                endpoint_url,
                json=_build_llm_probe_payload(endpoint_url, model),
                headers=_build_llm_probe_headers(),
                timeout=max(20.0, min(float(settings.llm_request_timeout_seconds), 120.0)),
            )
            response.raise_for_status()
            payload = response.json()
            reply = _extract_chat_completion_text(payload)
            if not reply:
                return {
                    "ok": False,
                    "method": "POST",
                    "status_code": response.status_code,
                    "probe": "chat_inference",
                    "error": "LLM probe returned empty content.",
                }

            return {
                "ok": True,
                "method": "POST",
                "status_code": response.status_code,
                "probe": "chat_inference",
                "attempts": attempt + 1,
                "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
                "model": model,
                "response_excerpt": reply[:120],
            }
        except Exception as exc:  # noqa: BLE001
            if attempt == 0 and _is_retryable_inference_error(exc):
                await asyncio.sleep(0.8)
                continue
            detail = str(exc).strip() or exc.__class__.__name__
            return {"ok": False, "method": "POST", "probe": "chat_inference", "error": detail}


async def _ollama_embedding_check(endpoint_url: str, model: str) -> dict[str, Any]:
    for attempt in range(2):
        started = datetime.utcnow()
        try:
            client = get_shared_async_client()
            response = await client.post(
                endpoint_url,
                json=_build_embedding_probe_payload(endpoint_url, model),
                timeout=max(6.0, min(float(settings.embedding_request_timeout_seconds), 12.0)),
            )
            response.raise_for_status()
            payload = response.json()
            vector = _extract_embedding_vector(payload)
            if not vector:
                return {
                    "ok": False,
                    "method": "POST",
                    "status_code": response.status_code,
                    "probe": "embedding_inference",
                    "error": "Embedding probe returned no vector.",
                }

            return {
                "ok": True,
                "method": "POST",
                "status_code": response.status_code,
                "probe": "embedding_inference",
                "attempts": attempt + 1,
                "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
                "model": model,
                "vector_size": len(vector),
            }
        except Exception as exc:  # noqa: BLE001
            if attempt == 0 and _is_retryable_inference_error(exc):
                await asyncio.sleep(0.5)
                continue
            detail = str(exc).strip() or exc.__class__.__name__
            return {"ok": False, "method": "POST", "probe": "embedding_inference", "error": detail}


async def _llm_check() -> dict[str, Any]:
    tags_url = _ollama_tags_url(settings.llm_api_url)
    if tags_url:
        model_check = await _ollama_model_check(settings.llm_api_url, settings.llm_model)
        if not settings.llm_readiness_inference_probe_enabled:
            model_check["inference_probe"] = "disabled"
            return model_check

        inference_check = await _ollama_chat_check(
            settings.llm_api_url,
            settings.llm_model,
        )
        if inference_check.get("ok"):
            inference_check["available_probe"] = model_check.get("probe")
            if not model_check.get("ok"):
                inference_check["model_catalog_warning"] = model_check
            return inference_check
        if not model_check.get("ok"):
            inference_check["model_catalog_warning"] = model_check
        else:
            inference_check["available_probe"] = model_check.get("probe")
            inference_check["model_catalog_ok"] = True
        return inference_check

    if not settings.llm_readiness_inference_probe_enabled:
        return {
            "ok": False,
            "method": "POST",
            "probe": "chat_inference",
            "inference_probe": "disabled",
            "error": "LLM readiness inference probe is disabled for a non-catalog endpoint.",
        }

    return await _ollama_chat_check(
        settings.llm_api_url,
        settings.llm_model,
    )


async def _embedding_check() -> dict[str, Any]:
    tags_url = _ollama_tags_url(settings.embedding_api_url)
    if tags_url:
        model_check = await _ollama_model_check(settings.embedding_api_url, settings.embedding_model)
        inference_check = await _ollama_embedding_check(settings.embedding_api_url, settings.embedding_model)
        if inference_check.get("ok"):
            inference_check["available_probe"] = model_check.get("probe")
            if not model_check.get("ok"):
                inference_check["model_catalog_warning"] = model_check
            return inference_check
        if not model_check.get("ok"):
            inference_check["model_catalog_warning"] = model_check
        return inference_check

    return await _ollama_embedding_check(settings.embedding_api_url, settings.embedding_model)


def _qdrant_vector_result_from_payload(
    payload: dict[str, Any],
    *,
    expected_vector_size: int,
    collection: str,
) -> dict[str, Any]:
    result = payload.get("result") if isinstance(payload, dict) else {}
    existing_vector_size = _extract_vector_size(payload) if isinstance(payload, dict) else None
    base: dict[str, Any] = {
        "collection": collection,
        "expected_vector_size": int(expected_vector_size),
        "existing_vector_size": existing_vector_size,
        "points_count": result.get("points_count") if isinstance(result, dict) else None,
    }

    if existing_vector_size == int(expected_vector_size):
        return {**base, "ok": True}

    if existing_vector_size is None:
        return {**base, "ok": False, "reason": "vector_size_missing"}

    return {**base, "ok": False, "reason": "vector_size_mismatch"}


async def _qdrant_vector_check(expected_vector_size: int) -> dict[str, Any]:
    started = datetime.utcnow()
    url = f"{settings.qdrant_url.rstrip('/')}/collections/{QDRANT_COLLECTION}"
    try:
        client = get_shared_async_client()
        response = await client.get(url, timeout=8)
        if response.status_code == 404:
            return {
                "ok": False,
                "method": "GET",
                "status_code": response.status_code,
                "collection": QDRANT_COLLECTION,
                "expected_vector_size": int(expected_vector_size),
                "reason": "collection_missing",
            }
        response.raise_for_status()
        payload = response.json() if response.content else {}
        result = _qdrant_vector_result_from_payload(
            payload if isinstance(payload, dict) else {},
            expected_vector_size=int(expected_vector_size),
            collection=QDRANT_COLLECTION,
        )
        return {
            **result,
            "method": "GET",
            "status_code": response.status_code,
            "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
        }
    except Exception as exc:  # noqa: BLE001
        detail = str(exc).strip() or exc.__class__.__name__
        return {
            "ok": False,
            "method": "GET",
            "collection": QDRANT_COLLECTION,
            "expected_vector_size": int(expected_vector_size),
            "reason": "collection_probe_failed",
            "error": detail,
        }


async def _cat_check() -> dict[str, Any]:
    started = datetime.utcnow()
    base_url = settings.cheshire_cat_url.rstrip("/")
    timeout_seconds = max(4.0, float(settings.cat_health_timeout_seconds))
    headers = {"Authorization": f"Bearer {settings.cheshire_cat_api_key}"}
    probe_user_id = f"{settings.cat_service_user_id}:health"

    try:
        client = get_shared_async_client()
        root_response = await client.get(f"{base_url}/", timeout=timeout_seconds)
        root_response.raise_for_status()

        llm_response = await client.get(f"{base_url}/llm/settings", headers=headers, timeout=timeout_seconds)
        llm_response.raise_for_status()
        llm_payload = llm_response.json()
        llm_settings = llm_payload if isinstance(llm_payload, dict) else {}
        llm_selected = str(llm_settings.get("selected_configuration") or "").strip()
        if llm_selected != "LLMOllamaConfig":
            return {
                "ok": False,
                "method": "GET",
                "status_code": llm_response.status_code,
                "error": f"Cat LLM not selected: {llm_selected or 'missing'}",
            }

        embed_response = await client.get(f"{base_url}/embedder/settings", headers=headers, timeout=timeout_seconds)
        embed_response.raise_for_status()
        embed_payload = embed_response.json()
        embed_settings = embed_payload if isinstance(embed_payload, dict) else {}
        embed_selected = str(embed_settings.get("selected_configuration") or "").strip()
        if embed_selected != "EmbedderOllamaConfig":
            return {
                "ok": False,
                "method": "GET",
                "status_code": embed_response.status_code,
                "error": f"Cat embedder not selected: {embed_selected or 'missing'}",
            }

        if settings.cat_primary_enabled:
            probe_response = await client.post(
                f"{base_url}/message",
                json=_build_cat_message_probe_payload("Reply with exactly CAT_READY", user_id=probe_user_id),
                headers=headers,
                timeout=timeout_seconds,
            )
            probe_response.raise_for_status()
            probe_payload = probe_response.json()
            probe_text = _extract_text_from_payload(probe_payload)
            if not probe_text or "cat_ready" not in probe_text.lower():
                return {
                    "ok": False,
                    "method": "POST",
                    "status_code": probe_response.status_code,
                    "probe": "message",
                    "error": "Cat probe returned an unexpected response.",
                    "response_excerpt": (probe_text or "")[:160],
                }

            return {
                "ok": True,
                "method": "POST",
                "status_code": 200,
                "probe": "message",
                "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
                "llm_selected": llm_selected,
                "embedder_selected": embed_selected,
            }

        probe_response = await client.post(
            f"{base_url}/memory/recall",
            json=_build_cat_memory_probe_payload(query_text="Trump docket update", user_id=probe_user_id),
            headers=headers,
            timeout=timeout_seconds,
        )
        probe_response.raise_for_status()
        probe_payload = probe_response.json()
        collections = ((probe_payload.get("vectors") or {}).get("collections") or {}) if isinstance(probe_payload, dict) else {}
        declarative_hits = collections.get("declarative") if isinstance(collections, dict) else []

        return {
            "ok": True,
            "method": "POST",
            "status_code": 200,
            "probe": "memory_recall",
            "latency_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
            "llm_selected": llm_selected,
            "embedder_selected": embed_selected,
            "recall_hits": len(declarative_hits or []),
        }
    except Exception as exc:  # noqa: BLE001
        detail = str(exc).strip() or exc.__class__.__name__
        return {"ok": False, "method": "POST", "error": detail}


@router.get("")
async def health_live() -> dict[str, Any]:
    return {"status": "ok", "service": settings.app_name, "timestamp": datetime.utcnow().isoformat()}


@router.get("/live")
async def health_live_alias() -> dict[str, Any]:
    return await health_live()


def _readiness_critical_ok(
    checks: dict[str, Any],
    *,
    cat_required: bool,
    llm_required: bool,
    embedding_required: bool,
    search_required: bool,
) -> bool:
    return bool(
        checks["database"].get("ok")
        and checks["redis"].get("ok")
        and checks["qdrant"].get("ok")
        and (checks["qdrant_vectors"].get("ok") or not embedding_required)
        and (checks["search_connector"].get("ok") or not search_required)
        and (checks["cheshire_cat"].get("ok") or not cat_required)
        and (checks["llm_api"].get("ok") or not llm_required)
        and (checks["embedding_api"].get("ok") or not embedding_required)
    )


@router.get("/ready")
async def health_ready(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    cat_required = bool(settings.cat_primary_enabled)
    # Cheshire Cat still depends on the same Ollama chat stack underneath, so chat availability
    # remains critical even when Cat is the primary router.
    llm_required = True
    (
        db_check,
        redis_check,
        qdrant_check,
        social_check,
        searx_check,
        embedding_check,
    ) = await asyncio.gather(
        _check_db(db),
        _check_redis(),
        _http_check(f"{settings.qdrant_url.rstrip('/')}/collections"),
        _http_check(f"{settings.social_publisher_url.rstrip('/')}/health"),
        _http_check(
            f"{settings.searxng_base_url.rstrip('/')}{settings.searxng_search_path}"
            "?q=healthcheck&format=json"
        ),
        _embedding_check(),
    )
    # Cheshire Cat and the direct writer probe both hit the same Ollama proxy, so probe them
    # sequentially to avoid creating a false-negative "server busy" collision during readiness checks.
    llm_check = await _llm_check()
    if embedding_check.get("ok") and isinstance(embedding_check.get("vector_size"), int):
        qdrant_vector_check = await _qdrant_vector_check(int(embedding_check["vector_size"]))
    else:
        qdrant_vector_check = {
            "ok": False,
            "collection": QDRANT_COLLECTION,
            "reason": "embedding_probe_unavailable",
        }
    cat_check = await _cat_check()

    checks = {
        "database": db_check,
        "redis": redis_check,
        "qdrant": qdrant_check,
        "qdrant_vectors": qdrant_vector_check,
        "cheshire_cat": {
            **cat_check,
            "required": cat_required,
        },
        "social_publisher": social_check,
        "search_connector": searx_check,
        "embedding_api": embedding_check,
        "llm_api": llm_check,
    }
    embedding_required = not settings.embedding_allow_fallback
    search_required = bool(settings.search_connector_required)
    critical_ok = _readiness_critical_ok(
        checks,
        cat_required=cat_required,
        llm_required=llm_required,
        embedding_required=embedding_required,
        search_required=search_required,
    )
    status = "ready" if critical_ok else "degraded"
    return {
        "status": status,
        "checks": checks,
        "cat_required": cat_required,
        "llm_required": llm_required,
        "embedding_required": embedding_required,
        "search_required": search_required,
    }


@router.get("/diagnostics")
async def health_diagnostics(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    ready = await health_ready(db)

    recent_jobs = (
        await db.execute(
            select(RevisionHistory)
            .where(RevisionHistory.object_table == "pipeline_cycle")
            .order_by(RevisionHistory.created_at.desc())
            .limit(40)
        )
    ).scalars().all()

    failed_jobs = [
        row for row in recent_jobs if row.action in {"stage_failed", "cycle_failed", "generated_style_rejected"}
    ]

    counts = {
        "sources": int((await db.scalar(select(func.count()).select_from(Source))) or 0),
        "source_embeddings": int((await db.scalar(select(func.count()).select_from(SourceEmbedding))) or 0),
        "embedded_sources": int(
            (await db.scalar(select(func.count(func.distinct(SourceEmbedding.source_id))).select_from(SourceEmbedding))) or 0
        ),
        "themes": int((await db.scalar(select(func.count()).select_from(Theme))) or 0),
        "editorial_objects": int((await db.scalar(select(func.count()).select_from(EditorialObject))) or 0),
        "homepage_snapshots": int((await db.scalar(select(func.count()).select_from(HomepageSnapshot))) or 0),
        "social_posts": int((await db.scalar(select(func.count()).select_from(SocialPost))) or 0),
    }

    return {
        "status": ready["status"],
        "readiness": ready,
        "counts": counts,
        "recent_jobs": [_serialize_revision(row) for row in recent_jobs[:20]],
        "failed_jobs": [_serialize_revision(row) for row in failed_jobs[:20]],
        "questions": {
            "what_ran": "Inspect recent_jobs for cycle/stage events.",
            "what_failed": "Inspect failed_jobs entries.",
            "why_failed": "Inspect failed_jobs[].snapshot.error.",
            "what_was_embedded": "Inspect source_embeddings counts plus Source.metadata.embedding_status / embedding_chunk_count.",
            "what_cat_received": "Inspect editorial_objects.metadata.retrieval_bundle and prompt_layers.",
        },
    }
