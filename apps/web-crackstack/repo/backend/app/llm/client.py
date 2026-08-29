from __future__ import annotations

from typing import Any

from app.llm.provider import ModelRequest, OpenAICompatibleProvider


class LocalAIClient(OpenAICompatibleProvider):
    """Deprecated compatibility adapter; use OpenAICompatibleProvider."""

    def __init__(self) -> None:
        import os

        super().__init__(
            base_url=os.getenv("AI_BASE_URL", os.getenv("LOCALAI_BASE_URL", "http://host.docker.internal:8844")),
            api_key=os.getenv("AI_API_KEY", os.getenv("LOCALAI_API_KEY", "")),
            model_roles={
                "fast": os.getenv("AI_MODEL_FAST", "rassy-fast"),
                "reasoning": os.getenv(
                    "AI_MODEL_PRIMARY", os.getenv("LOCALAI_MODEL", "rassy-smart")
                ),
                "data": os.getenv("AI_MODEL_DATA", os.getenv("LOCALAI_MODEL", "rassy-smart")),
            },
        )
        self.model = self.model_for("reasoning")

    def chat_completions(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        return self.complete(
            ModelRequest(messages, tools=tools, tool_choice=tool_choice, temperature=temperature)
        )
