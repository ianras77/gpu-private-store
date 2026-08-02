#!/usr/bin/env python3
"""Validate the appstore's canonical RassyMind integration contract.

Install dependencies with:
python3 -m pip install -r scripts/requirements-rassymind-validator.txt
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
LEARNING_AI_APP_NAMES = (
    "learning-airflow",
    "learning-label-studio",
    "learning-mlflow",
    "learning-wandb",
)
RETIRED_NAMES = ("RASSYCODEX", "RASSYGPT")
KEY_SUFFIX = "_RASSYMIND_API_KEY"
ALLOWED_ALIASES = frozenset(
    {
        "rassy-smart",
        "rassy-mind",
        "rassy-code",
        "rassy-fast",
        "rassy-utility",
        "rassy-embed",
        "rassy-embed-query",
        "rassy-rerank",
        "rassy-stt",
        "rassy-tts",
    }
)
RETIRED_MODEL_ALIASES = frozenset(
    {
        "rassy-agent",
        "rassy-code-agent",
        "rassy-coder",
        "rassy-codex",
        "rassy-codex-lite",
        "rassy-general",
        "rassy-summarizer",
        "rassy-worker",
        "rassy-worker-code",
    }
)

IGNORED_DIRECTORIES = frozenset(
    {
        ".git",
        ".next",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        "__pycache__",
        "build",
        "dist",
        "historical",
        "history",
        "node_modules",
        "superpowers",
    }
)
IGNORED_FILE_NAMES = frozenset(
    {
        "bun.lock",
        "bun.lockb",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
    }
)
BINARY_SUFFIXES = frozenset(
    {
        ".7z",
        ".avi",
        ".bin",
        ".gif",
        ".gz",
        ".ico",
        ".jpeg",
        ".jpg",
        ".mov",
        ".mp3",
        ".mp4",
        ".pdf",
        ".png",
        ".pyc",
        ".so",
        ".tar",
        ".webm",
        ".webp",
        ".woff",
        ".woff2",
        ".zip",
    }
)
ALIAS_PATTERN = re.compile(r"(?<![A-Za-z0-9_])rassy-[a-z0-9-]+")
MODEL_CONTEXT_PATTERN = re.compile(
    r"(?:ALIAS|CHAT|CODER|EMBED|LLM|MODEL|RERANK|STT|SUMMAR|TTS)", re.IGNORECASE
)


def scoped_apps(root: Path) -> list[Path]:
    """Return direct RassyMind consumers in stable name order."""
    apps = [path for path in root.glob("web-*") if path.is_dir() and not path.is_symlink()]
    apps.extend(
        root / name
        for name in LEARNING_AI_APP_NAMES
        if (root / name).is_dir() and not (root / name).is_symlink()
    )
    return sorted(apps, key=lambda path: path.name)


def form_variables(config: dict) -> set[str]:
    fields = config.get("form_fields")
    if not isinstance(fields, list):
        return set()
    return {
        variable
        for field in fields
        if isinstance(field, dict)
        and isinstance((variable := field.get("env_variable")), str)
    }


def active_files(app: Path) -> list[Path]:
    files: list[Path] = []
    for path in app.rglob("*"):
        if path.is_symlink():
            continue
        relative = path.relative_to(app)
        if any(part in IGNORED_DIRECTORIES or part.endswith(".cache") for part in relative.parts):
            continue
        if not path.is_file() or path.name in IGNORED_FILE_NAMES or path.suffix.lower() in BINARY_SUFFIXES:
            continue
        files.append(path)
    return sorted(files, key=lambda path: path.as_posix())


def text_lines(path: Path) -> list[str] | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        return None


def is_gateway_variable(name: object) -> bool:
    return isinstance(name, str) and (
        name in {"RASSYMIND_API_BASE", "RASSYMIND_BASE_URL"}
        or name.endswith(("_RASSYMIND_API_BASE", "_RASSYMIND_BASE_URL"))
    )


def environment_items(environment: object) -> list[tuple[object, object]]:
    if isinstance(environment, dict):
        return list(environment.items())
    if not isinstance(environment, list):
        return []

    items: list[tuple[object, object]] = []
    for entry in environment:
        if isinstance(entry, str) and "=" in entry:
            items.append(tuple(entry.split("=", 1)))
        elif isinstance(entry, dict):
            items.extend(entry.items())
    return items


def has_canonical_gateway_default(compose: str) -> bool:
    """Inspect only Compose service environments for a canonical gateway value."""
    try:
        document = yaml.safe_load(compose)
    except yaml.YAMLError:
        return False
    if not isinstance(document, dict) or not isinstance(document.get("services"), dict):
        return False

    for service in document["services"].values():
        if not isinstance(service, dict):
            continue
        for name, value in environment_items(service.get("environment")):
            if is_gateway_variable(name) and "host.docker.internal:8844" in str(value):
                return True
    return False


def contract_path_error(app: Path, path: Path) -> str | None:
    relative = f"{app.name}/{path.name}"
    if path.is_symlink():
        return f"{relative}: contract path must not be a symlink"
    try:
        app_root = app.resolve(strict=True)
        resolved = path.resolve(strict=True)
    except OSError:
        return None
    if not resolved.is_relative_to(app_root):
        return f"{relative}: resolved contract path must remain inside {app.name}"
    return None


def validate_root(root: Path) -> list[str]:
    """Return deterministic, secret-safe contract errors for a repository root."""
    errors: list[str] = []
    for app in scoped_apps(root):
        config_path = app / "config.json"
        compose_path = app / "docker-compose.yml"

        config_path_problem = contract_path_error(app, config_path)
        if config_path_problem:
            errors.append(config_path_problem)
            config = {}
        else:
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
                errors.append(f"{app.name}: cannot read config.json ({type(error).__name__})")
                config = {}

            variables = form_variables(config) if isinstance(config, dict) else set()
            if not any(variable == "RASSYMIND_API_KEY" or variable.endswith(KEY_SUFFIX) for variable in variables):
                errors.append(
                    f"{app.name}/config.json: form must expose RASSYMIND_API_KEY "
                    f"or an app-prefixed *{KEY_SUFFIX} field"
                )

        compose_path_problem = contract_path_error(app, compose_path)
        if compose_path_problem:
            errors.append(compose_path_problem)
            compose = ""
        else:
            try:
                compose = compose_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as error:
                errors.append(f"{app.name}: cannot read docker-compose.yml ({type(error).__name__})")
                compose = ""
            if not has_canonical_gateway_default(compose):
                errors.append(
                    f"{app.name}/docker-compose.yml: direct consumer must default its gateway "
                    "to host.docker.internal:8844"
                )

        for path in active_files(app):
            lines = text_lines(path)
            if lines is None:
                continue
            relative = path.relative_to(root).as_posix()
            for line_number, line in enumerate(lines, start=1):
                for retired_name in RETIRED_NAMES:
                    if retired_name in line:
                        errors.append(
                            f"{relative}:{line_number}: retired name {retired_name} must be replaced with RASSYMIND"
                        )
                aliases: set[str] = set()
                for match in ALIAS_PATTERN.finditer(line):
                    alias = match.group()
                    prefix = line[: match.start()]
                    if re.search(r"[A-Za-z0-9_]-$", prefix):
                        continue
                    if alias in RETIRED_MODEL_ALIASES or (
                        MODEL_CONTEXT_PATTERN.search(prefix)
                        and (":" in prefix or "=" in prefix)
                    ):
                        aliases.add(alias)
                for alias in sorted(aliases - ALLOWED_ALIASES):
                    errors.append(
                        f"{relative}:{line_number}: model alias {alias} is outside the RassyMind allowlist"
                    )

    return sorted(set(errors))


def main() -> int:
    errors = validate_root(ROOT)
    if errors:
        print("RassyMind contract validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    web_count = sum(app.name.startswith("web-") for app in scoped_apps(ROOT))
    learning_count = len(scoped_apps(ROOT)) - web_count
    print(f"RassyMind contract validated for {web_count} web apps and {learning_count} learning apps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
