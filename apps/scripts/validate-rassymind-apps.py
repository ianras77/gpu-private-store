#!/usr/bin/env python3
"""Validate the appstore's canonical RassyMind integration contract."""

from __future__ import annotations

import json
import re
from pathlib import Path


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
GATEWAY_DEFAULT_PATTERN = re.compile(
    r"^\s*(?:-\s*)?[A-Z0-9_]*RASSYMIND_(?:API_BASE|BASE_URL)\s*(?::|=)"
    r"[^#]*host\.docker\.internal:8844"
)
MODEL_CONTEXT_PATTERN = re.compile(
    r"(?:ALIAS|CHAT|CODER|EMBED|LLM|MODEL|RERANK|STT|SUMMAR|TTS)", re.IGNORECASE
)


def scoped_apps(root: Path) -> list[Path]:
    """Return direct RassyMind consumers in stable name order."""
    apps = [path for path in root.glob("web-*") if path.is_dir()]
    apps.extend(root / name for name in LEARNING_AI_APP_NAMES if (root / name).is_dir())
    return sorted(apps, key=lambda path: path.name)


def form_variables(config: dict) -> set[str]:
    return {
        variable
        for field in config.get("form_fields", [])
        if isinstance(field, dict)
        and isinstance((variable := field.get("env_variable")), str)
    }


def active_files(app: Path) -> list[Path]:
    files: list[Path] = []
    for path in app.rglob("*"):
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


def has_canonical_gateway_default(compose: str) -> bool:
    """Return whether a live RassyMind API-base assignment uses the gateway."""
    for raw_line in compose.splitlines():
        line = raw_line.split("#", 1)[0]
        if GATEWAY_DEFAULT_PATTERN.search(line):
            return True
    return False


def validate_root(root: Path) -> list[str]:
    """Return deterministic, secret-safe contract errors for a repository root."""
    errors: list[str] = []
    for app in scoped_apps(root):
        config_path = app / "config.json"
        compose_path = app / "docker-compose.yml"

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
