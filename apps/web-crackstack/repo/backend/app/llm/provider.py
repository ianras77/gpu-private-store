"""Provider-neutral, synchronous OpenAI-compatible model boundary.

The agent currently consumes the legacy ``chat_completions`` shape.  This
module makes configuration and capability handling provider-neutral while the
compatibility adapter remains available during the workflow migration.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol

import httpx


@dataclass(frozen=True)
class ProviderCapabilities:
    streaming: bool = False
    tools: bool = False
    structured_json: bool = False
    strict_json_schema: bool = False
    large_context: bool = False
    vision: bool = False
    embeddings: bool = False


@dataclass(frozen=True)
class ModelRequest:
    messages: list[dict[str, Any]]
    role: str = "reasoning"
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None
    temperature: float = 0.2


class AIProvider(Protocol):
    def capabilities(self) -> ProviderCapabilities: ...

    def complete(self, request: ModelRequest) -> dict[str, Any]: ...


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


class OpenAICompatibleProvider:
    """Minimal provider for services implementing OpenAI chat completions."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model_roles: dict[str, str] | None = None,
        capabilities: ProviderCapabilities | None = None,
    ) -> None:
        self.base_url = (base_url or _env("AI_BASE_URL", "http://host.docker.internal:8844")).rstrip("/")
        self.api_key = api_key if api_key is not None else _env("AI_API_KEY")
        self.model_roles = model_roles or {
            "fast": _env("AI_MODEL_FAST", "rassy-fast"),
            "reasoning": _env("AI_MODEL_PRIMARY", "rassy-mind"),
            "data": _env("AI_MODEL_DATA", _env("AI_MODEL_PRIMARY", "rassy-mind")),
            "code": _env("AI_MODEL_CODE", "rassy-code"),
        }
        self._capabilities = capabilities or ProviderCapabilities(tools=True, structured_json=True)

    def capabilities(self) -> ProviderCapabilities:
        return self._capabilities

    def model_for(self, role: str) -> str:
        return self.model_roles.get(role, self.model_roles["reasoning"])

    def complete(self, request: ModelRequest) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model_for(request.role),
            "messages": request.messages,
            "temperature": request.temperature,
        }
        if request.tools:
            payload["tools"] = request.tools
        if request.tool_choice:
            payload["tool_choice"] = request.tool_choice
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{self.base_url}/v1/chat/completions", headers=headers, json=payload
            )
            response.raise_for_status()
            return response.json()


class OpenAIProvider(OpenAICompatibleProvider):
    """OpenAI-hosted provider using the same validated request boundary."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("base_url", _env("AI_BASE_URL", "https://api.openai.com"))
        super().__init__(**kwargs)


def configured_provider() -> OpenAICompatibleProvider:
    """Build the configured provider without exposing provider details to callers."""
    provider_name = _env("AI_PROVIDER", "openai-compatible").lower()
    if provider_name == "openai":
        return OpenAIProvider()
    if provider_name in {"openai-compatible", "openai_compatible", "localai"}:
        return OpenAICompatibleProvider()
    raise ValueError(f"unsupported AI_PROVIDER: {provider_name}")
