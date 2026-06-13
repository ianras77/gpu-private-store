import os
from crewai import LLM

RASSYCODEX_API_BASE = os.getenv("RASSYCODEX_API_BASE", "http://host.docker.internal:8844/v1")
LOCALAI_API_BASE = os.getenv("LOCALAI_API_BASE", RASSYCODEX_API_BASE)
LOCALAI_API_KEY = os.getenv("LOCALAI_API_KEY") or os.getenv("RASSYCODEX_API_KEY", "")
LOCALAI_LLM_MODEL = os.getenv(
    "LOCALAI_LLM_MODEL",
    os.getenv("RASSYCODEX_CHAT_MODEL", "rassy-codex"),
)


def get_llm() -> LLM:
    """
    Main chat LLM for all your agents.
    Uses RassyCodex as an OpenAI-compatible backend.
    """
    print(f"[LLM] Using LocalAI model={LOCALAI_LLM_MODEL} base={LOCALAI_API_BASE}")

    return LLM(
        model=LOCALAI_LLM_MODEL,
        base_url=LOCALAI_API_BASE,
        api_key=LOCALAI_API_KEY,
        # You can tune these if you like:
        # temperature=0.3,
        # max_tokens=2048,
    )


if __name__ == "__main__":
    llm = get_llm()
    print("LLM object created:", llm)
