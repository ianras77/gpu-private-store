from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.routes import agent as agent_routes


def test_health_smoke() -> None:
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_agent_thread_flow_smoke(monkeypatch: object) -> None:
    agent_routes.THREADS.clear()

    def fake_run_agent(  # type: ignore[override]
        history,
        user_message,
        tenant_id,
        dataset_id=None,
        force_tool=True,
        user_id=None,
    ):
        return {
            "content": "stub-response",
            "events": [{"type": "assistant", "content": "stub-response"}],
            "messages": [
                {"role": "system", "content": "stub"},
                {"role": "assistant", "content": "stub-response"},
            ],
        }

    monkeypatch.setattr(agent_routes, "run_agent", fake_run_agent)

    with TestClient(app) as client:
        create = client.post(
            "/agent/threads",
            json={"dataset_id": "demo_smoke", "brand": "xlcrack"},
            headers={"X-API-Key": "local-dev-key"},
        )
        assert create.status_code == 200
        thread_id = create.json()["thread_id"]

        chat = client.post(
            f"/agent/threads/{thread_id}/chat",
            json={"message": "hello", "dataset_id": "demo_smoke"},
            headers={"X-API-Key": "local-dev-key"},
        )
    assert chat.status_code == 200
    payload = chat.json()
    assert payload["thread_id"] == thread_id
    assert payload["assistant"] == "stub-response"
    assert payload["events"] == [{"type": "assistant", "content": "stub-response"}]
