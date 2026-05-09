from __future__ import annotations

import json

import pytest

from app.llm import agent


@pytest.fixture
def fake_handle_tool(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, object]]]:
    calls: list[tuple[str, dict[str, object]]] = []

    def _fake_handle_tool(
        name: str,
        arguments: str,
        _context: dict[str, object],
    ) -> dict[str, object]:
        payload = json.loads(arguments or "{}")
        calls.append((name, payload))

        if name == "list_datasets":
            return {"datasets": [{"dataset_id": "ds_1", "name": "Demo"}]}
        if name == "recommend_workstreams":
            return {
                "recommendations": [
                    {
                        "recommendation_id": "rec_revenue_cleanup",
                        "name": "Revenue Cleanup Template",
                        "summary": "Normalize dates and regions.",
                        "confidence": 0.9,
                        "rationale": ["Detected revenue/region/date columns."],
                        "suggested_steps": [
                            {"type": "normalize_dates", "column": "invoice_date"},
                            {"type": "map_values", "column": "region", "map": "region_aliases"},
                        ],
                        "output_targets": ["csv_download", "workstream_reuse"],
                        "prompt_hint": "Normalize and map then preview.",
                    }
                ]
            }
        if name == "get_schema":
            return {
                "schema": [
                    {"name": "invoice_date", "type": "string", "nulls": 0, "distinct": 5},
                    {"name": "region", "type": "string", "nulls": 0, "distinct": 3},
                    {"name": "revenue", "type": "float", "nulls": 2, "distinct": 10},
                ]
            }
        if name == "sample_rows":
            return {"rows": [{"invoice_date": "01/05/24", "region": "NE", "revenue": 120.0}]}
        if name == "profile_columns":
            return {"profiles": [{"name": "region", "nulls": 0, "top_values": [["NE", 10]]}]}
        if name == "propose_recipe":
            steps = payload.get("steps", [])
            risk_flags = ["row_deletion"] if any(s.get("type") == "filter" for s in steps) else []
            return {"recipe": payload, "risk_flags": risk_flags}
        if name == "validate_recipe":
            steps = payload.get("steps", [])
            risk_flags = ["row_deletion"] if any(s.get("type") == "filter" for s in steps) else []
            return {"valid": True, "warnings": [], "risk_flags": risk_flags}
        if name == "preview_recipe":
            return {
                "preview": {
                    "before_rows": 100,
                    "after_rows": 95,
                    "row_delta_pct": -5.0,
                    "risk_flags": ["row_deletion"],
                }
            }
        if name == "request_approval":
            return {"approval_token": "tok-123", "risk_flags": payload.get("risk_flags", [])}
        if name == "run_recipe":
            return {
                "result": {
                    "dataset_id": payload.get("dataset_id", "ds_1"),
                    "version_id": "v2",
                    "row_count": 95,
                },
                "risk_flags": ["row_deletion"],
            }
        raise AssertionError(f"Unexpected tool {name}")

    def _fake_llm(*_args: object, **_kwargs: object) -> dict[str, object]:
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr(agent, "handle_tool", _fake_handle_tool)
    monkeypatch.setattr(agent.LocalAIClient, "chat_completions", _fake_llm)
    return calls


def test_auto_mode_falls_back_for_dataset_analysis(
    fake_handle_tool: list[tuple[str, dict[str, object]]],
) -> None:
    result = agent.run_agent(
        history=[],
        user_message=(
            "List datasets, then get schema, sample rows, and column profiles "
            "for the dataset."
        ),
        tenant_id="tenant_demo",
        dataset_id="ds_1",
    )

    called = [name for name, _payload in fake_handle_tool]
    assert called == ["list_datasets", "get_schema", "sample_rows", "profile_columns"]
    assert any(event["type"] == "assistant" for event in result["events"])


def test_auto_mode_handles_preview_approval_and_run(
    fake_handle_tool: list[tuple[str, dict[str, object]]],
) -> None:
    preview = agent.run_agent(
        history=[],
        user_message="Normalize dates, map region aliases, and drop rows where revenue is null.",
        tenant_id="tenant_demo",
        dataset_id="ds_1",
    )
    called_preview = [name for name, _payload in fake_handle_tool]
    assert called_preview[:4] == [
        "get_schema",
        "profile_columns",
        "propose_recipe",
        "validate_recipe",
    ]
    assert "preview_recipe" in called_preview

    approval = agent.run_agent(
        history=preview["messages"][1:],
        user_message="Request approval for this recipe.",
        tenant_id="tenant_demo",
        dataset_id="ds_1",
    )
    assert any(name == "request_approval" for name, _payload in fake_handle_tool)

    run = agent.run_agent(
        history=approval["messages"][1:],
        user_message="Use approval token tok-123 and run the recipe steps now.",
        tenant_id="tenant_demo",
        dataset_id="ds_1",
    )

    run_calls = [payload for name, payload in fake_handle_tool if name == "run_recipe"]
    assert run_calls
    assert run_calls[-1]["approval_token"] == "tok-123"
    assert run["content"].startswith("Executed tools")


def test_auto_mode_handles_template_recommendation_intent(
    fake_handle_tool: list[tuple[str, dict[str, object]]],
) -> None:
    result = agent.run_agent(
        history=[],
        user_message="Recommend the best template for this dataset.",
        tenant_id="tenant_demo",
        dataset_id="ds_1",
    )

    called = [name for name, _payload in fake_handle_tool]
    assert called == ["recommend_workstreams"]
    assert result["content"].startswith("Executed tools")
