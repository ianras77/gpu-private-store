import os
from pathlib import Path


FORBIDDEN_RUNTIME_POINTERS = {
    "http://rassygpt-gateway:8080": "use host.docker.internal:8844 for the local RassyCodex stack",
    "http://localai-lb:8080": "use host.docker.internal:8844 for the local RassyCodex stack",
    "http://localhost:8111": "use host.docker.internal:8844 for the local RassyCodex stack",
    "http://127.0.0.1:8112": "use host.docker.internal:8844 for the local RassyCodex stack",
    "http://ollama-general:11434": "use host.docker.internal:8844 for the local RassyCodex stack",
    "http://ollama-embed:11434": "use host.docker.internal:8844 for the local RassyCodex stack",
    "ollama_llm-net": "use host-gateway routing instead of the retired Ollama Docker network",
    "localai_default": "use host-gateway routing instead of the retired LocalAI Docker network",
    "qwen3-1.7b": "use a current RassyCodex alias such as rassy-smart or rassy-fast",
}

SKIPPED_PARTS = {
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "data",
    "dist",
    "node_modules",
    "tests",
    "__tests__",
}

SKIPPED_FILENAMES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
}

SCANNED_SUFFIXES = {
    "",
    ".env",
    ".example",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}


def _is_scanned_file(path: Path, app_root: Path) -> bool:
    relative_parts = path.relative_to(app_root).parts
    if any(part in SKIPPED_PARTS for part in relative_parts):
        return False
    if path.name in SKIPPED_FILENAMES:
        return False
    return path.suffix in SCANNED_SUFFIXES or path.name.startswith(".env")


def test_web_apps_do_not_point_at_retired_local_llm_stack():
    apps_root = Path(__file__).resolve().parents[1] / "apps"
    hits: list[str] = []

    for web_app in sorted(apps_root.glob("web-*")):
        if not web_app.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(web_app):
            dirnames[:] = [dirname for dirname in dirnames if dirname not in SKIPPED_PARTS]
            for filename in sorted(filenames):
                path = Path(dirpath, filename)
                if not _is_scanned_file(path, web_app):
                    continue
                try:
                    text = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                for pointer, replacement in FORBIDDEN_RUNTIME_POINTERS.items():
                    if pointer in text:
                        hits.append(f"{path.relative_to(apps_root)}: replace {pointer!r}; {replacement}")

    assert hits == []


def test_web_astro_api_uses_node_image_with_native_build_tools():
    app_root = Path(__file__).resolve().parents[1] / "apps" / "web-astro"
    compose_text = (app_root / "docker-compose.yml").read_text(encoding="utf-8")

    api_service_text = compose_text.split("  astro-api:", 1)[1].split("    depends_on:", 1)[0]

    assert "image: node:20-bullseye" in api_service_text
    assert "dockerfile:" not in api_service_text
    assert "apt-get install" not in api_service_text


def test_web_app_build_contexts_use_runtipi_host_root():
    apps_root = Path(__file__).resolve().parents[1] / "apps"
    hits: list[str] = []

    for compose_path in sorted(apps_root.glob("web-*/docker-compose.yml")):
        text = compose_path.read_text(encoding="utf-8")
        if "${RUNTIPI_APP_BUILD_ROOT:-/data/apps}" in text:
            hits.append(str(compose_path.relative_to(apps_root)))

    assert hits == []


def test_web_jogmania_minio_alias_is_on_app_network():
    compose_text = (
        Path(__file__).resolve().parents[1] / "apps" / "web-jogmania" / "docker-compose.yml"
    ).read_text(encoding="utf-8")

    minio_service_text = compose_text.split("  minio:", 1)[1].split("  postgres:", 1)[0]

    assert "web-jogmania_gpu-private-store_network:" in minio_service_text
    assert "- jogmania-minio" in minio_service_text
    assert "- minio" in minio_service_text
