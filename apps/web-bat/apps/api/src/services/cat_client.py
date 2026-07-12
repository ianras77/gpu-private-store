from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
import time
import uuid

import httpx

from config import settings
from services.http_clients import get_shared_async_client
from services.structured_logging import get_logger, log_event

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
logger = get_logger("bat.cat_client")
CAT_NOT_CONFIGURED_MARKERS = (
    "you did not configure a language model",
    "do it in the settings",
)
PROMPT_PROFILE_LIMITS = {
    "cat": {
        "system_prompt": 1800,
        "task_prompt": 1300,
        "context": 3600,
        "output_contract": 700,
    },
    "llm": {
        "system_prompt": 3200,
        "task_prompt": 2600,
        "context": 5600,
        "output_contract": 1500,
    },
}
MAX_GENERATION_TOKENS = 2400


def load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _extract_text_from_payload(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("content", "text", "answer", "response"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        # Handle common Cheshire Cat shape: {"content": [{"text": "..."}]}.
        content = payload.get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        return text.strip()
    return None


def _extract_chat_completion_text(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None

    direct = _extract_text_from_payload(payload)
    if direct:
        return direct

    top_level_message = payload.get("message")
    if isinstance(top_level_message, dict):
        top_level_content = top_level_message.get("content")
        if isinstance(top_level_content, str) and top_level_content.strip():
            return top_level_content.strip()

    choices = payload.get("choices")
    if not isinstance(choices, list):
        return None

    for choice in choices:
        if not isinstance(choice, dict):
            continue

        # OpenAI-compatible shape.
        message = choice.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                parts: list[str] = []
                for item in content:
                    if isinstance(item, str):
                        parts.append(item.strip())
                    elif isinstance(item, dict):
                        text = item.get("text") or item.get("content")
                        if isinstance(text, str):
                            parts.append(text.strip())
                merged = " ".join(part for part in parts if part).strip()
                if merged:
                    return merged

        # Alternate completion shapes.
        text = choice.get("text")
        if isinstance(text, str) and text.strip():
            return text.strip()
        delta = choice.get("delta")
        if isinstance(delta, dict):
            delta_content = delta.get("content")
            if isinstance(delta_content, str) and delta_content.strip():
                return delta_content.strip()

    return None


def _truncate_prompt_section(text: str, *, limit: int, label: str) -> str:
    safe_text = (text or "").strip()
    if len(safe_text) <= limit:
        return safe_text

    suffix = f"\n[{label} truncated for runtime safety.]"
    clipped = safe_text[: max(0, limit - len(suffix))].rstrip()
    return f"{clipped}{suffix}" if clipped else suffix.strip()


def _looks_like_cat_not_configured(message: str | None) -> bool:
    normalized = (message or "").strip().lower()
    return bool(normalized) and any(marker in normalized for marker in CAT_NOT_CONFIGURED_MARKERS)


def _compose_prompt_payload(
    *,
    system_prompt: str,
    task_prompt: str,
    context: str,
    output_contract: str,
    profile: str = "llm",
    include_system_prompt: bool = True,
) -> str:
    limits = PROMPT_PROFILE_LIMITS.get(profile, PROMPT_PROFILE_LIMITS["llm"])
    safe_system_prompt = _truncate_prompt_section(
        system_prompt,
        limit=limits["system_prompt"],
        label="System prompt",
    )
    safe_task_prompt = _truncate_prompt_section(
        task_prompt,
        limit=limits["task_prompt"],
        label="Task prompt",
    )
    safe_context = _truncate_prompt_section(
        context,
        limit=limits["context"],
        label="Context",
    )
    safe_output_contract = _truncate_prompt_section(
        output_contract,
        limit=limits["output_contract"],
        label="Output contract",
    )

    sections: list[str] = []
    if include_system_prompt and safe_system_prompt:
        sections.append("Layer A: System Editorial Constitution\n" + safe_system_prompt)
    sections.append("Layer B: Task Prompt\n" + safe_task_prompt)
    sections.append("Layer C: Retrieval Bundle\n" + safe_context)
    if safe_output_contract:
        sections.append("Layer D: Output Contract\n" + safe_output_contract)
    return "\n\n".join(section for section in sections if section)


def _is_ollama_native_chat_url(url: str) -> bool:
    return url.rstrip("/").endswith("/api/chat")


def _clamp_generation_tokens(max_tokens: int | None) -> int:
    requested = int(max_tokens or 260)
    return max(96, min(requested, MAX_GENERATION_TOKENS))


def _generation_timeout_seconds(*, requested_tokens: int, base_timeout_seconds: float) -> float:
    # Longer long-form passes need extra headroom, especially on local Ollama models.
    dynamic_floor = 20.0 + (max(0, int(requested_tokens)) / 26.0)
    return max(float(base_timeout_seconds or 0), dynamic_floor)


def _build_request_headers(*, api_key: str | None, request_id: str) -> dict[str, str]:
    headers = {"X-Request-ID": request_id}
    safe_key = (api_key or "").strip()
    if safe_key:
        headers["Authorization"] = f"Bearer {safe_key}"
    return headers

def _build_llm_payload(
    *,
    url: str,
    system_prompt: str,
    prompt: str,
    temperature: float,
    max_tokens: int,
    model_override: str | None = None,
) -> dict[str, Any]:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    resolved_model = (model_override or settings.llm_model).strip() or settings.llm_model
    if _is_ollama_native_chat_url(url):
        return {
            "model": resolved_model,
            "messages": messages,
            "stream": False,
            "keep_alive": settings.ollama_keep_alive,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": max(2048, int(settings.ollama_num_ctx)),
                "repeat_last_n": max(0, int(settings.ollama_repeat_last_n)),
                "repeat_penalty": max(1.0, float(settings.ollama_repeat_penalty)),
            },
        }
    return {
        "model": resolved_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "reasoning_effort": "none",
        "stream": False,
    }


def _is_retryable_llm_error(exc: Exception) -> bool:
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


def _llm_retry_backoff_seconds() -> float:
    return min(max(float(settings.llm_retry_backoff_seconds), 0.0), 30.0)


async def generate_with_cat(
    task_prompt: str,
    context: str,
    *,
    system_prompt: str | None = None,
    output_contract: str = "",
    correlation_id: str | None = None,
    temperature: float = 0.55,
    max_tokens: int = 260,
    model_override: str | None = None,
) -> str:
    request_id = correlation_id or str(uuid.uuid4())
    resolved_system_prompt = system_prompt or load_prompt("cat_editor_system")
    resolved_temperature = min(max(float(temperature or 0.55), 0.0), 1.2)
    resolved_max_tokens = _clamp_generation_tokens(max_tokens)
    cat_prompt = _compose_prompt_payload(
        system_prompt=resolved_system_prompt,
        task_prompt=task_prompt,
        context=context,
        output_contract=output_contract,
        profile="cat",
        include_system_prompt=True,
    )
    llm_prompt = _compose_prompt_payload(
        system_prompt=resolved_system_prompt,
        task_prompt=task_prompt,
        context=context,
        output_contract=output_contract,
        profile="llm",
        include_system_prompt=False,
    )

    if settings.cat_primary_enabled:
        body = {
            "text": cat_prompt,
            "user_id": request_id,
        }
        headers = _build_request_headers(api_key=settings.cheshire_cat_api_key, request_id=request_id)

        try:
            timeout_seconds = _generation_timeout_seconds(
                requested_tokens=resolved_max_tokens,
                base_timeout_seconds=max(8.0, float(settings.cat_request_timeout_seconds)),
            )
            timeout = httpx.Timeout(timeout_seconds, connect=min(10.0, timeout_seconds))
            started = time.perf_counter()
            client = get_shared_async_client()
            try:
                await client.delete(
                    f"{settings.cheshire_cat_url.rstrip('/')}/memory/conversation_history",
                    headers=headers,
                    timeout=min(8.0, timeout_seconds),
                )
            except Exception as exc:  # noqa: BLE001
                log_event(
                    logger,
                    "cat.memory.clear_failed",
                    level=30,
                    provider="cheshire_cat",
                    request_id=request_id,
                    error=str(exc),
                )
            response = await client.post(
                f"{settings.cheshire_cat_url.rstrip('/')}/message",
                json=body,
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            data = response.json()
            message = _extract_text_from_payload(data)
            if message:
                if _looks_like_cat_not_configured(message):
                    log_event(
                        logger,
                        "cat.generate.not_configured",
                        level=40,
                        provider="cheshire_cat",
                        request_id=request_id,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                    )
                else:
                    log_event(
                        logger,
                        "cat.generate.success",
                        provider="cheshire_cat",
                        request_id=request_id,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        response_chars=len(message),
                        model=model_override or settings.llm_model,
                    )
                    return message
            else:
                log_event(logger, "cat.generate.empty", level=30, provider="cheshire_cat", request_id=request_id)
        except Exception as exc:  # noqa: BLE001
            log_event(
                logger,
                "cat.generate.failed",
                level=40,
                provider="cheshire_cat",
                request_id=request_id,
                error=str(exc),
            )
    else:
        log_event(logger, "cat.generate.primary_disabled", provider="cheshire_cat", request_id=request_id)

    llm_headers = _build_request_headers(api_key=settings.llm_api_key, request_id=request_id)
    llm_urls = [settings.llm_api_url]
    if settings.llm_api_url.endswith("/v1/chat/completions"):
        llm_urls.append(settings.llm_api_url.removesuffix("/v1/chat/completions") + "/api/chat")

    provider = "llm_fallback" if settings.cat_primary_enabled else "llm_primary"
    for llm_url in llm_urls:
        for attempt in range(2):
            try:
                llm_payload = _build_llm_payload(
                    url=llm_url,
                    system_prompt=resolved_system_prompt,
                    prompt=llm_prompt,
                    temperature=resolved_temperature,
                    max_tokens=resolved_max_tokens,
                    model_override=model_override,
                )
                started = time.perf_counter()
                client = get_shared_async_client()
                response = await client.post(
                    llm_url,
                    json=llm_payload,
                    headers=llm_headers,
                    timeout=_generation_timeout_seconds(
                        requested_tokens=resolved_max_tokens,
                        base_timeout_seconds=max(12.0, float(settings.llm_request_timeout_seconds)),
                    ),
                )
                response.raise_for_status()
                data = response.json()

                message = _extract_chat_completion_text(data)
                if message:
                    log_event(
                        logger,
                        "cat.generate.success",
                        provider=provider,
                        request_id=request_id,
                        url=llm_url,
                        attempts=attempt + 1,
                        latency_ms=int((time.perf_counter() - started) * 1000),
                        response_chars=len(message),
                        model=model_override or settings.llm_model,
                    )
                    return message
                log_event(
                    logger,
                    "cat.generate.empty",
                    level=30,
                    provider=provider,
                    request_id=request_id,
                    url=llm_url,
                    attempts=attempt + 1,
                )
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 0 and _is_retryable_llm_error(exc):
                    backoff_seconds = _llm_retry_backoff_seconds()
                    log_event(
                        logger,
                        "cat.generate.retrying",
                        level=30,
                        provider=provider,
                        request_id=request_id,
                        url=llm_url,
                        attempt=attempt + 1,
                        backoff_seconds=backoff_seconds,
                        error=str(exc),
                    )
                    await asyncio.sleep(backoff_seconds)
                    continue
                log_event(
                    logger,
                    "cat.generate.failed",
                    level=40,
                    provider=provider,
                    request_id=request_id,
                    url=llm_url,
                    attempt=attempt + 1,
                    error=str(exc),
                )
                break

    log_event(logger, "cat.generate.fallback_used", level=30, request_id=request_id)
    return ""
