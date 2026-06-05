import json
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[4]


def test_compose_defaults_use_reachable_rassygpt_host_gateway() -> None:
    compose_text = (APP_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "rassygpt-gateway:8080" not in compose_text
    assert "http://host.docker.internal:8844/api/chat" in compose_text
    assert "http://host.docker.internal:8844/api/embed" in compose_text
    assert compose_text.count("http://host.docker.internal:8844") >= 4
    assert compose_text.count("extra_hosts: *bat-host-gateway") >= 3


def test_worker_service_has_healthcheck() -> None:
    compose_text = (APP_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    start = compose_text.index("  bat-worker:")
    end = compose_text.index("\n\nnetworks:", start)
    worker_section = compose_text[start:end]

    assert "healthcheck:" in worker_section
    assert "python -m workers.healthcheck" in worker_section


def test_app_versions_stay_in_sync() -> None:
    app_config = json.loads((APP_ROOT / "config.json").read_text(encoding="utf-8"))
    package_json = json.loads((APP_ROOT / "apps/web/package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((APP_ROOT / "apps/web/package-lock.json").read_text(encoding="utf-8"))

    assert package_json["version"] == app_config["version"]
    assert package_lock["version"] == app_config["version"]
    assert package_lock["packages"][""]["version"] == app_config["version"]
