#!/usr/bin/env python3
"""Validate the appstore's canonical RassyCodex wiring."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB_APPS = sorted(ROOT.glob("web-*"))
LEARNING_AI_APPS = [
    ROOT / "learning-airflow",
    ROOT / "learning-label-studio",
    ROOT / "learning-mlflow",
    ROOT / "learning-wandb",
]


def form_variables(config: dict) -> set[str]:
    return {field.get("env_variable") for field in config.get("form_fields", [])}


def main() -> int:
    errors: list[str] = []

    for app in [*WEB_APPS, *LEARNING_AI_APPS]:
        config_path = app / "config.json"
        compose_path = app / "docker-compose.yml"
        config = json.loads(config_path.read_text())
        compose = compose_path.read_text()
        variables = form_variables(config)

        key_inputs = {
            variable
            for variable in variables
            if variable == "RASSYCODEX_API_KEY" or variable.endswith("_RASSYCODEX_API_KEY")
        }
        if not key_inputs:
            errors.append(f"{app.name}: Runtipi form does not expose a RassyCodex API key")

        if "RASSYCODEX_API_BASE" in compose and "host.docker.internal:8844" not in compose:
            errors.append(f"{app.name}: missing host.docker.internal:8844 gateway default")

    if errors:
        print("RassyCodex contract validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print(f"RassyCodex contract validated for {len(WEB_APPS)} web apps and {len(LEARNING_AI_APPS)} learning apps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
