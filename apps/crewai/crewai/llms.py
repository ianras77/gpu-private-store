import os
from crewai import LLM

LOCALAI_API_BASE = os.getenv("LOCALAI_API_BASE", "http://host.docker.internal:8111/v1")
LOCALAI_API_KEY = os.getenv("LOCALAI_API_KEY", "localai-demo-key")
LOCALAI_LLM_MODEL = os.getenv("LOCALAI_LLM_MODEL", "watt-ai_watt-tool-70b")


def get_llm() -> LLM:
    """
    Main chat LLM for all your agents.
    Uses LocalAI as an OpenAI-compatible backend.
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
