from __future__ import annotations

import json
import uuid
from typing import Any

from app.data import catalog, store, workstreams

TOOL_DEFS = [
    {
        "type": "function",
        "function": {
            "name": "list_datasets",
            "description": "List datasets available to the user.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schema",
            "description": "Fetch schema metadata for a dataset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                },
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sample_rows",
            "description": "Return sample rows for a dataset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "profile_columns",
            "description": "Return column profiles (nulls, distinct, top values).",
            "parameters": {
                "type": "object",
                "properties": {"dataset_id": {"type": "string"}},
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_recipe",
            "description": "Return a structured transformation recipe.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "intent": {"type": "string"},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string"},
                                "column": {"type": "string"},
                                "expr": {"type": "string"},
                                "map": {"type": "string"},
                            },
                            "required": ["type"],
                        },
                    },
                    "warnings": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["dataset_id", "intent", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_recipe",
            "description": "Preview row impacts and risk flags for a recipe.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["dataset_id", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_recipe",
            "description": "Validate a recipe for risky or unsupported steps.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["dataset_id", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_approval",
            "description": "Request approval for a high-impact change.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "risk_flags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "risk_flags"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_recipe",
            "description": "Execute a recipe and create a new dataset version.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "object"}},
                    "approval_token": {"type": "string"},
                    "recipe_name": {"type": "string"},
                },
                "required": ["dataset_id", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_workstreams",
            "description": "List saved user workstreams (modular crack streams).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_workstreams",
            "description": "Recommend agentic workstream templates based on dataset profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "limit": {"type": "integer", "default": 4},
                },
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recognize_workstreams",
            "description": "Find saved workstreams that match an incoming dataset template.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "min_score": {"type": "number", "default": 0.6},
                    "limit": {"type": "integer", "default": 5},
                },
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_workstream",
            "description": "Save a modular workstream for the current user from recipe steps.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "steps": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["dataset_id", "name", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_workstream",
            "description": "Run a saved workstream recipe against a dataset.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workstream_id": {"type": "string"},
                    "dataset_id": {"type": "string"},
                },
                "required": ["workstream_id", "dataset_id"],
            },
        },
    },
]

APPROVALS: dict[str, dict[str, Any]] = {}


def _risk_flags(steps: list[dict[str, Any]]) -> list[str]:
    flags = []
    for step in steps:
        step_type = step.get("type", "").lower()
        if step_type in {"filter", "drop", "delete"}:
            flags.append("row_deletion")
        if step_type in {"cast", "normalize_dates"}:
            flags.append("type_change")
    return sorted(set(flags))


def _resolve_dataset_id(payload: dict[str, Any], context: dict[str, Any]) -> str:
    dataset_id = payload.get("dataset_id") or context.get("dataset_id")
    if not dataset_id:
        raise ValueError("dataset_id is required")
    return dataset_id


def handle_tool(name: str, arguments: str, context: dict[str, Any]) -> dict[str, Any]:
    tenant_id = context["tenant_id"]
    user_id = context.get("user_id", "user_demo")

    if name == "list_datasets":
        return {"datasets": store.list_datasets(tenant_id)}
    if name == "get_schema":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        return {"schema": store.get_schema(tenant_id, dataset_id)}
    if name == "sample_rows":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        return {
            "rows": store.sample_rows(
                tenant_id,
                dataset_id,
                int(payload.get("limit", 5)),
            )
        }
    if name == "profile_columns":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        return {"profiles": store.profile_columns(tenant_id, dataset_id)}
    if name == "propose_recipe":
        payload = json.loads(arguments or "{}")
        steps = payload.get("steps", [])
        return {
            "recipe": payload,
            "risk_flags": _risk_flags(steps),
        }
    if name == "preview_recipe":
        payload = json.loads(arguments or "{}")
        steps = payload.get("steps", [])
        dataset_id = _resolve_dataset_id(payload, context)
        risk_flags = _risk_flags(steps)
        preview = store.preview_recipe(tenant_id, dataset_id, steps)
        return {
            "preview": preview | {"risk_flags": risk_flags},
        }
    if name == "validate_recipe":
        payload = json.loads(arguments or "{}")
        steps = payload.get("steps", [])
        risk_flags = _risk_flags(steps)
        warnings = store.validate_recipe_steps(steps)
        if "row_deletion" in risk_flags:
            warnings.append("Row deletion detected: approval required.")
        return {"valid": True, "warnings": warnings, "risk_flags": risk_flags}
    if name == "request_approval":
        payload = json.loads(arguments or "{}")
        token = str(uuid.uuid4())
        APPROVALS[token] = {
            "summary": payload.get("summary"),
            "risk_flags": payload.get("risk_flags", []),
            "tenant_id": tenant_id,
        }
        return {"approval_token": token, "risk_flags": payload.get("risk_flags", [])}
    if name == "run_recipe":
        payload = json.loads(arguments or "{}")
        steps = payload.get("steps", [])
        dataset_id = _resolve_dataset_id(payload, context)
        risk_flags = _risk_flags(steps)
        approval_token = payload.get("approval_token")
        if risk_flags and not approval_token:
            return {"error": "approval_token required", "risk_flags": risk_flags}
        if approval_token and approval_token not in APPROVALS:
            return {"error": "invalid approval_token"}
        if approval_token and APPROVALS[approval_token]["tenant_id"] != tenant_id:
            return {"error": "approval_token not valid for tenant"}
        result = store.run_recipe(
            tenant_id,
            dataset_id,
            steps,
            recipe_name=payload.get("recipe_name"),
        )
        return {"result": result, "risk_flags": risk_flags}
    if name == "list_workstreams":
        items = catalog.list_workstreams(tenant_id, user_id=user_id)
        return {"workstreams": items}
    if name == "recommend_workstreams":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        profile = store.get_profile(tenant_id, dataset_id)
        recommendations = workstreams.recommend_workstream_templates(
            profile,
            limit=int(payload.get("limit", 4)),
        )
        return {"recommendations": recommendations}
    if name == "recognize_workstreams":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        profile = store.get_profile(tenant_id, dataset_id)
        signature = workstreams.build_signature_from_profile(profile)
        known = catalog.list_workstreams(tenant_id, user_id=user_id)
        matches = workstreams.recognize_workstreams(
            signature,
            known,
            min_score=float(payload.get("min_score", 0.6)),
            limit=int(payload.get("limit", 5)),
        )
        return {"matches": matches}
    if name == "save_workstream":
        payload = json.loads(arguments or "{}")
        dataset_id = _resolve_dataset_id(payload, context)
        steps = payload.get("steps", [])
        if not isinstance(steps, list) or not steps:
            return {"error": "steps are required"}
        warnings = store.validate_recipe_steps(steps)
        blocking = [warning for warning in warnings if warning.startswith("Unsupported")]
        if blocking:
            return {"error": "invalid steps", "warnings": blocking}
        profile = store.get_profile(tenant_id, dataset_id)
        signature = workstreams.build_signature_from_profile(profile)
        created = catalog.create_workstream(
            tenant_id=tenant_id,
            user_id=str(user_id),
            name=str(payload.get("name") or "Saved Workstream"),
            description=payload.get("description"),
            recipe_steps=steps,
            match_signature=signature,
            metadata={"source_dataset_id": dataset_id},
        )
        return {"workstream": created, "warnings": warnings}
    if name == "run_workstream":
        payload = json.loads(arguments or "{}")
        workstream_id = str(payload.get("workstream_id") or "")
        dataset_id = _resolve_dataset_id(payload, context)
        if not workstream_id:
            return {"error": "workstream_id is required"}
        item = catalog.get_workstream(tenant_id, workstream_id)
        if not item:
            return {"error": "workstream not found"}
        if item.get("user_id") != user_id:
            return {"error": "forbidden"}
        result = store.run_recipe(
            tenant_id,
            dataset_id,
            item.get("recipe_steps") or [],
            recipe_name=item.get("name"),
        )
        run = catalog.create_workstream_run(
            tenant_id=tenant_id,
            workstream_id=workstream_id,
            user_id=str(user_id),
            dataset_id=dataset_id,
            status="completed",
            output_version_id=result.get("version_id"),
        )
        return {"run": run, "result": result}
    raise ValueError(f"Unknown tool {name}")
