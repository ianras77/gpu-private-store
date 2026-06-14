from __future__ import annotations

import os
from typing import Any

import httpx

LOCALAI_BASE_URL = os.getenv("LOCALAI_BASE_URL", "http://host.docker.internal:8844")
LOCALAI_MODEL = os.getenv("LOCALAI_MODEL", "rassy-smart")
LOCALAI_API_KEY = os.getenv("LOCALAI_API_KEY", "")


class LocalAIClient:
    def __init__(self) -> None:
        self.base_url = LOCALAI_BASE_URL.rstrip("/")
        self.model = LOCALAI_MODEL
        self.headers = {"Content-Type": "application/json"}
        if LOCALAI_API_KEY:
            self.headers["Authorization"] = f"Bearer {LOCALAI_API_KEY}"

    def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
