from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx

import app as gateway_app


class _FailingHttpClient:
    async def post(self, *args, **kwargs):
        raise httpx.ReadError("upstream dropped the connection")


class _JsonRequest:
    def __init__(self, payload: dict):
        self._payload = payload
        self.headers = {}

    async def json(self) -> dict:
        return self._payload


class _MappedHttpClient:
    def __init__(self, responses: dict[str, list[httpx.Response]]):
        self.responses = responses
        self.calls: list[str] = []

    async def post(self, url, *args, **kwargs):
        self.calls.append(url)
        queued = self.responses[url]
        return queued.pop(0)


def test_smart_chat_routes_very_long_prompts_to_long_context_lane() -> None:
    payload = {
        "messages": [
            {
                "role": "user",
                "content": "playlist planning context " * 9000,
            }
        ],
        "max_tokens": 560,
    }

    assert gateway_app._smart_chat_target(payload) == "rassy-coder"


def test_post_json_returns_clean_503_for_upstream_read_error(monkeypatch) -> None:
    monkeypatch.setattr(gateway_app.app.state, "http", _FailingHttpClient(), raising=False)
    request = SimpleNamespace(headers={})

    response = asyncio.run(
        gateway_app._post_json(
            "http://rassygpt-embed:8080/v1/embeddings",
            {"model": "rassy-embed", "input": ["hello"]},
            request,
            response_model="rassy-embed",
        )
    )

    assert response.status_code == 503
    assert b"upstream_unavailable" in response.body


def test_smart_chat_falls_back_when_selected_lane_returns_5xx(monkeypatch) -> None:
    client = _MappedHttpClient(
        {
            "http://rassygpt-coder-secondary:8000/v1/chat/completions": [
                httpx.Response(503, json={"error": "warming"})
            ],
            "http://rassygpt-coder:8080/v1/chat/completions": [
                httpx.Response(
                    200,
                    json={
                        "id": "chatcmpl-test",
                        "object": "chat.completion",
                        "model": "upstream-coder",
                        "choices": [{"message": {"role": "assistant", "content": "ok"}}],
                    },
                )
            ],
        }
    )
    monkeypatch.setattr(gateway_app.app.state, "http", client, raising=False)
    request = _JsonRequest(
        {
            "model": "rassy-smart",
            "messages": [{"role": "user", "content": "fix this python function"}],
            "max_tokens": 256,
        }
    )

    response = asyncio.run(gateway_app._proxy_openai_json(request, "chat", "/v1/chat/completions"))
    data = json.loads(response.body)

    assert response.status_code == 200
    assert data["model"] == "rassy-coder"
    assert client.calls == [
        "http://rassygpt-coder-secondary:8000/v1/chat/completions",
        "http://rassygpt-coder:8080/v1/chat/completions",
    ]


def test_ready_uses_configured_required_backends_and_keeps_optional_status(monkeypatch) -> None:
    monkeypatch.setattr(
        gateway_app,
        "_load_config",
        lambda: {"server": {"required_backends": ["general", "fast"]}},
    )

    async def backend_statuses() -> dict:
        return {
            "general": {"healthy": True},
            "fast": {"healthy": True},
            "image": {"healthy": False, "message": "warming"},
        }

    monkeypatch.setattr(gateway_app, "_backend_statuses", backend_statuses)

    response = asyncio.run(gateway_app.ready())

    assert response["ready"] is True
    assert response["required"] == ["general", "fast"]
    assert response["backends"]["image"]["healthy"] is False
