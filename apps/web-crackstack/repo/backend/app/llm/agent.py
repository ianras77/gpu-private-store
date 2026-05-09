from __future__ import annotations

import json
import os
import re
from typing import Any

from app.llm.client import LocalAIClient
from app.llm.prompts import SYSTEM_PROMPT
from app.llm.tools import TOOL_DEFS, handle_tool


class AgentRunError(RuntimeError):
    pass


def _as_tool_message(tool_call_id: str, name: str, content: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "name": name,
        "content": json.dumps(content),
    }


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _extract_dataset_prefix(
    user_message: str,
    dataset_id: str | None,
) -> tuple[str, str | None]:
    lines = user_message.splitlines()
    if lines and lines[0].lower().startswith("dataset:"):
        if not dataset_id:
            dataset_id = lines[0].split(":", 1)[1].strip() or None
        return "\n".join(lines[1:]).strip(), dataset_id
    return user_message, dataset_id


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _pick_column(columns: list[dict[str, Any]], candidates: tuple[str, ...]) -> str | None:
    for column in columns:
        name = str(column.get("name") or "")
        if not name:
            continue
        lowered = name.lower()
        if any(candidate in lowered for candidate in candidates):
            return name
    return None


def _infer_recipe_steps(
    intent: str,
    schema: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    lowered = intent.lower()
    date_col = _pick_column(schema, ("invoice", "order", "created", "updated", "date", "time"))
    region_col = _pick_column(schema, ("region", "state", "territory", "area"))
    revenue_col = _pick_column(schema, ("revenue", "amount", "sales", "total"))

    steps: list[dict[str, Any]] = []

    if _contains_any(
        lowered,
        ("normalize date", "clean date", "date format", "normalize"),
    ) and date_col:
        steps.append({"type": "normalize_dates", "column": date_col})

    if _contains_any(
        lowered,
        ("map region", "region alias", "normalize region", "standardize region", "alias"),
    ) and region_col:
        steps.append(
            {
                "type": "map_values",
                "column": region_col,
                "map": "region_aliases",
            }
        )

    if _contains_any(
        lowered,
        ("drop rows", "remove rows", "null revenue", "null rows", "filter"),
    ) and revenue_col:
        steps.append(
            {
                "type": "filter",
                "expr": f"{_quote_ident(revenue_col)} IS NOT NULL",
            }
        )

    if "aggregate" in lowered and date_col and revenue_col:
        steps.append({"type": "select", "columns": [date_col, revenue_col]})

    if not steps and schema:
        steps.append({"type": "select", "columns": [str(col["name"]) for col in schema[:3]]})

    return steps


def _parse_tool_payload(message: dict[str, Any]) -> dict[str, Any] | None:
    content = message.get("content")
    if not isinstance(content, str):
        return None
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        return payload
    return None


def _latest_steps(history: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    for message in reversed(history):
        if message.get("role") != "tool" or message.get("name") != "propose_recipe":
            continue
        payload = _parse_tool_payload(message)
        if not payload:
            continue
        recipe = payload.get("recipe")
        if isinstance(recipe, dict) and isinstance(recipe.get("steps"), list):
            return recipe["steps"]
    return None


def _latest_risk_flags(history: list[dict[str, Any]]) -> list[str]:
    for message in reversed(history):
        if message.get("role") != "tool":
            continue
        payload = _parse_tool_payload(message)
        if not payload:
            continue
        if message.get("name") == "preview_recipe":
            preview = payload.get("preview")
            if isinstance(preview, dict) and isinstance(preview.get("risk_flags"), list):
                return [str(flag) for flag in preview["risk_flags"]]
        if message.get("name") in {"validate_recipe", "propose_recipe"}:
            flags = payload.get("risk_flags")
            if isinstance(flags, list):
                return [str(flag) for flag in flags]
    return []


def _latest_approval_token(history: list[dict[str, Any]]) -> str | None:
    for message in reversed(history):
        if message.get("role") != "tool" or message.get("name") != "request_approval":
            continue
        payload = _parse_tool_payload(message)
        if payload and isinstance(payload.get("approval_token"), str):
            return payload["approval_token"]
    return None


def _extract_token_from_text(text: str) -> str | None:
    match = re.search(r"approval token\s*[:=]?\s*([A-Za-z0-9-]{6,})", text, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _extract_workstream_id_from_text(text: str) -> str | None:
    match = re.search(r"\bws_[A-Za-z0-9]{6,}\b", text)
    if match:
        return match.group(0)
    return None


def _latest_workstream_id(history: list[dict[str, Any]]) -> str | None:
    for message in reversed(history):
        if message.get("role") != "tool":
            continue
        payload = _parse_tool_payload(message)
        if not payload:
            continue
        if message.get("name") == "save_workstream":
            workstream = payload.get("workstream")
            if isinstance(workstream, dict) and isinstance(workstream.get("workstream_id"), str):
                return workstream["workstream_id"]
        if message.get("name") == "list_workstreams":
            items = payload.get("workstreams")
            if isinstance(items, list) and items and isinstance(items[0], dict):
                workstream_id = items[0].get("workstream_id")
                if isinstance(workstream_id, str):
                    return workstream_id
    return None


def _run_deterministic_agent(
    history: list[dict[str, Any]],
    user_message: str,
    tenant_id: str,
    dataset_id: str | None,
    user_id: str | None = None,
) -> dict[str, Any]:
    intent, dataset_id = _extract_dataset_prefix(user_message, dataset_id)
    lowered = intent.lower()

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]
    events: list[dict[str, Any]] = []
    context = {"tenant_id": tenant_id, "dataset_id": dataset_id, "user_id": user_id}
    executed_tools: list[str] = []

    def call_tool(name: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            result = handle_tool(name, json.dumps(payload), context)
        except Exception as exc:  # noqa: BLE001
            result = {"error": str(exc)}
        events.append(
            {
                "type": "tool_call",
                "name": name,
                "arguments": json.dumps(payload),
                "result": result,
            }
        )
        messages.append(_as_tool_message(f"det-{len(events)}", name, result))
        executed_tools.append(name)
        return result

    should_list = _contains_any(lowered, ("list dataset", "list datasets", "datasets"))
    should_schema = _contains_any(lowered, ("schema", "analy", "inspect"))
    should_sample = _contains_any(lowered, ("sample",))
    should_profile = _contains_any(lowered, ("profile", "null", "distinct", "column"))
    should_recipe = _contains_any(
        lowered,
        ("normalize", "map", "drop", "filter", "recipe", "preview", "run", "clean", "transform"),
    )
    should_request_approval = _contains_any(lowered, ("request approval", "approval gate"))
    should_run = _contains_any(
        lowered,
        ("run recipe", "run the recipe", "approve & run", "run now"),
    )
    should_recommend_streams = _contains_any(
        lowered,
        ("recommend", "recommendation", "suggest template", "guided flow", "best template"),
    )
    should_recognize_streams = _contains_any(
        lowered,
        ("recognize", "known template", "known workstream", "match workstream"),
    )
    should_save_stream = _contains_any(
        lowered,
        ("save workstream", "save stream", "remember this recipe", "save this recipe"),
    )
    should_run_stream = _contains_any(
        lowered,
        ("run workstream", "run saved stream", "execute workstream"),
    )
    explicit_token = _extract_token_from_text(intent)
    explicit_workstream_id = _extract_workstream_id_from_text(intent)
    if explicit_token:
        should_run = True

    schema_result: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] | None = None
    risk_flags: list[str] = []

    if should_list:
        call_tool("list_datasets", {})

    if dataset_id and (should_schema or should_sample or should_profile or should_recipe):
        schema_payload = call_tool("get_schema", {"dataset_id": dataset_id})
        schema_result = schema_payload.get("schema", []) if isinstance(schema_payload, dict) else []

    if dataset_id and should_recommend_streams:
        call_tool("recommend_workstreams", {"dataset_id": dataset_id, "limit": 4})

    if dataset_id and should_sample:
        call_tool("sample_rows", {"dataset_id": dataset_id, "limit": 5})

    if dataset_id and should_profile:
        call_tool("profile_columns", {"dataset_id": dataset_id})

    if should_recognize_streams and dataset_id:
        call_tool("recognize_workstreams", {"dataset_id": dataset_id, "min_score": 0.6, "limit": 5})

    if dataset_id and should_recipe:
        steps = _infer_recipe_steps(intent, schema_result)
        proposal = call_tool(
            "propose_recipe",
            {
                "dataset_id": dataset_id,
                "intent": intent,
                "steps": steps,
                "warnings": [],
            },
        )
        if isinstance(proposal.get("risk_flags"), list):
            risk_flags = [str(flag) for flag in proposal["risk_flags"]]
        validation = call_tool(
            "validate_recipe",
            {"dataset_id": dataset_id, "steps": steps},
        )
        if isinstance(validation.get("risk_flags"), list):
            risk_flags = [str(flag) for flag in validation["risk_flags"]]
        preview = call_tool(
            "preview_recipe",
            {"dataset_id": dataset_id, "steps": steps},
        )
        preview_payload = preview.get("preview")
        if isinstance(preview_payload, dict) and isinstance(
            preview_payload.get("risk_flags"),
            list,
        ):
            risk_flags = [str(flag) for flag in preview_payload["risk_flags"]]

    if should_request_approval:
        if not risk_flags:
            risk_flags = _latest_risk_flags(history)
        if not risk_flags:
            risk_flags = ["manual_review"]
        call_tool(
            "request_approval",
            {
                "summary": "Approval requested for proposed recipe execution.",
                "risk_flags": risk_flags,
            },
        )

    if dataset_id and should_run:
        if steps is None:
            steps = _latest_steps(history) or _infer_recipe_steps(intent, schema_result)
        approval_token = explicit_token or _latest_approval_token(messages)
        payload: dict[str, Any] = {"dataset_id": dataset_id, "steps": steps}
        if approval_token:
            payload["approval_token"] = approval_token
        call_tool("run_recipe", payload)

    if should_save_stream and dataset_id:
        if steps is None:
            steps = (
                _latest_steps(messages)
                or _latest_steps(history)
                or _infer_recipe_steps(intent, schema_result)
            )
        call_tool(
            "save_workstream",
            {
                "dataset_id": dataset_id,
                "name": "Saved Crack Stream",
                "description": "Saved from deterministic agent flow.",
                "steps": steps,
            },
        )

    if should_run_stream and dataset_id:
        workstream_id = (
            explicit_workstream_id
            or _latest_workstream_id(messages)
            or _latest_workstream_id(history)
        )
        if workstream_id:
            call_tool(
                "run_workstream",
                {"workstream_id": workstream_id, "dataset_id": dataset_id},
            )

    if not executed_tools and dataset_id:
        schema_payload = call_tool("get_schema", {"dataset_id": dataset_id})
        if isinstance(schema_payload, dict) and isinstance(schema_payload.get("schema"), list):
            call_tool("sample_rows", {"dataset_id": dataset_id, "limit": 5})

    if executed_tools:
        summary = "Executed tools: " + ", ".join(executed_tools)
    else:
        summary = "No applicable tool actions detected."

    messages.append({"role": "assistant", "content": summary})
    events.append({"type": "assistant", "content": summary})
    return {
        "content": summary,
        "events": events,
        "messages": messages,
    }


def run_agent(
    history: list[dict[str, Any]],
    user_message: str,
    tenant_id: str,
    dataset_id: str | None = None,
    force_tool: bool = True,
    user_id: str | None = None,
) -> dict[str, Any]:
    mode = os.getenv("CRACKSTACK_AGENT_MODE", "auto").strip().lower()
    if mode == "deterministic":
        return _run_deterministic_agent(
            history,
            user_message,
            tenant_id,
            dataset_id,
            user_id=user_id,
        )

    client = LocalAIClient()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {"role": "user", "content": user_message},
    ]

    tool_choice = "required" if force_tool else "auto"
    events: list[dict[str, Any]] = []

    context = {"tenant_id": tenant_id, "dataset_id": dataset_id, "user_id": user_id}

    for _ in range(8):
        try:
            response = client.chat_completions(
                messages=messages,
                tools=TOOL_DEFS,
                tool_choice=tool_choice,
            )
        except Exception as exc:  # noqa: BLE001
            if mode == "llm":
                raise AgentRunError(f"LLM call failed: {exc}") from exc
            return _run_deterministic_agent(
                history,
                user_message,
                tenant_id,
                dataset_id,
                user_id=user_id,
            )
        choice = response["choices"][0]
        message = choice["message"]
        tool_calls = message.get("tool_calls")

        if tool_calls:
            for tool_call in tool_calls:
                name = tool_call["function"]["name"]
                arguments = tool_call["function"].get("arguments", "{}")
                try:
                    result = handle_tool(name, arguments, context)
                except Exception as exc:  # noqa: BLE001
                    result = {"error": str(exc)}
                events.append(
                    {
                        "type": "tool_call",
                        "name": name,
                        "arguments": arguments,
                        "result": result,
                    }
                )
                messages.append(
                    _as_tool_message(tool_call["id"], name, result)
                )
            tool_choice = "auto"
            continue

        content = message.get("content", "")
        messages.append({"role": "assistant", "content": content})
        events.append({"type": "assistant", "content": content})
        return {
            "content": content,
            "events": events,
            "messages": messages,
        }

    if mode == "llm":
        raise AgentRunError("Agent did not converge after tool calls")
    return _run_deterministic_agent(history, user_message, tenant_id, dataset_id, user_id=user_id)
