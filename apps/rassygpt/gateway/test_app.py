from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx

import app as gateway_app


class _FailingHttpClient:
    async def post(self, *args, **kwargs):
        raise httpx.ReadError("upstream dropped the connection")


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
