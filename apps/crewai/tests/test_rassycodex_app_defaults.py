from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
STORE_ROOT = APP_ROOT.parent
RASSYCODEX_BASE = "http://host.docker.internal:8844/v1"
OLD_GATEWAY = "http://rassygpt-gateway:8080/v1"

MODEL_CLIENT_COMPOSES = [
    "crewai/docker-compose.yml",
    "langflow/docker-compose.yml",
    "learning-airflow/docker-compose.yml",
    "learning-label-studio/docker-compose.yml",
    "learning-mlflow/docker-compose.yml",
    "learning-wandb/docker-compose.yml",
]


def read(relative_path: str) -> str:
    return (STORE_ROOT / relative_path).read_text()


def test_model_client_compose_defaults_target_rassycodex() -> None:
    for relative_path in MODEL_CLIENT_COMPOSES:
        compose = read(relative_path)

        assert OLD_GATEWAY not in compose, relative_path
        assert RASSYCODEX_BASE in compose, relative_path
        assert "RASSYCODEX_API_KEY" in compose, relative_path
        assert "RASSYCODEX_CHAT_MODEL" in compose, relative_path
        assert "RASSYCODEX_EMBED_MODEL" in compose, relative_path


def test_crewai_python_fallbacks_target_rassycodex() -> None:
    expectations = {
        "crewai/crewai/llms.py": [
            RASSYCODEX_BASE,
            "rassy-codex",
            "RASSYCODEX_API_KEY",
        ],
        "crewai/crewai/localai_clients.py": [
            RASSYCODEX_BASE,
            "rassy-embed",
            "rassy-rerank",
            "RASSYCODEX_API_KEY",
        ],
        "crewai/crewai/rag_coding_crew.py": [
            RASSYCODEX_BASE,
            "rassy-codex",
        ],
    }

    for relative_path, expected_strings in expectations.items():
        source = read(relative_path)

        assert OLD_GATEWAY not in source, relative_path
        assert "http://host.docker.internal:8111/v1" not in source, relative_path
        assert "http://host.docker.internal:11434" not in source, relative_path
        for expected in expected_strings:
            assert expected in source, relative_path
